/**
 * rudiment - CRUD resource manager
 * https://github.com/gavinhungry/rudiment
 */

(function() {
  'use strict';

  var pkg = require('./package.json');

  var dbTypes = pkg.dbModules.map(function(dbModule) {
    var dbType = require('./lib/db/' + dbModule + '.js');
    dbType.name = dbModule;

    return dbType;
  });

  var defaultDbType = dbTypes.find(function(dbType) {
    return dbType.default;
  });

  /**
   * Given a passed database object, get the database type
   *
   * @param {Object} db - database object passed to Rudiment constructor
   * @return {Object|null} object from dbTypes
   */
  var getDbType = function(db) {
    if (!db.type) {
      return defaultDbType;
    }

    return dbTypes.find(function(dbType) {
      return dbType.name === db.type;
    }) || null;
  };

  /**
   * @constructor for Rudiment objects
   *
   * Rudiment objects have prototype methods that can be overridden as needed.
   * By default, the database should support a subset of MongoDB API methods.
   *
   * The schema is a predicate function that determines the validity of a
   * candidate document. The props array is filled automatically if possible.
   *
   * @param {Object} opts
   * @param {Object} opts.db - database
   * @param {Function} [opts.schema] - predicate function for schema validation
   * @param {Array} [opts.props] - document properties to filter
   * @param {String} [opts.key] - document key in database (defaults to first prop or dbType.id)
   * @param {Array} [opts.uniq] - document properties to consider unique
   */
  var Rudiment = function(opts) {
    var that = this;
    opts = opts || {};

    this._db = opts.db;
    if (!this._db) {
      throw new Error('No database provided');
    }

    this._dbType = getDbType(opts.db);

    if (!this._dbType) {
      throw new Error('Unknown database type');
    }

    this._schema = Array.isArray(opts.schema) ? opts.schema : (opts.schema ? [opts.schema] : []);
    this._in_map = opts.in;
    this._out_map = opts.out;

    // attempt to get props from the passed schema
    var schemaProps;
    if (this._schema[0] && this._schema[0].toJSON) {
      var obj = this._schema[0].toJSON();
      if (obj && obj.properties) {
        schemaProps = Object.keys(obj.properties);
      }
    }

    this._path = opts.path;
    this._key = opts.key || (schemaProps ? schemaProps[0] : null) || this._dbType.id;
    this._props = opts.props || schemaProps;

    if (opts.auto) {
      this._auto = true;
      this._key = opts.auto;
    }

    this._uniq = opts.uniq || [this._key];

    // allow the constructor to override any of the prototype methods
    Object.keys(Rudiment.prototype).forEach(function(method) {
      if (opts[method]) {
        that[method] = opts[method];
      }
    });

    this._dbApi = this._dbType.api();
    Object.keys(this._dbApi).forEach(function(dbApiFnName) {
      that._dbApi[dbApiFnName] = that._dbApi[dbApiFnName].bind(that);
    });

    this._init = this._dbApi.init();
  };

  Rudiment.getSupportedDbTypes = function() {
    return dbTypes.map(function(dbType) {
      return dbType.name;
    });
  };

  Rudiment.prototype = {
    getDbType: function() {
      return this._dbType.name;
    },

    /**
     * Remove extraneous properties from a document
     *
     * @param {Object} doc - a document to clean
     * @return {Object} a copy of the cleaned document
     */
    clean: function(doc) {
      if (!this._props) {
        return doc;
      }

      return this._props.reduce(function(obj, prop) {
        if (doc.hasOwnProperty(prop)) {
          obj[prop] = doc[prop];
        }

        return obj;
      }, {});
    },

    /**
     * Check if a document is valid
     *
     * A document is valid if it passes the schema. If no schema is defined,
     * always returns true.
     *
     * @param {Object} doc - a document to test
     * @return {Boolean}
     */
    valid: function(doc) {
      return !!this._schema.find(function(schemaFn) {
        return schemaFn(doc);
      });
    },

    /**
     * Check if a document is admissible
     *
     * A document is admissible if it passes the valid predicate, and no other
     * document in the database is already using its unique keys.
     *
     * @param {Object} doc - a document to test
     * @param {Function} callback(err, {Boolean})
     */
    admissible: function(doc, callback) {
      if (!this.valid(doc)) {
        callback(null, false);
        return;
      }

      this._db.find({
        $or: this._uniq.map(function(uniq) {
          return o(uniq, doc[uniq]);
        })
      }, function(err, docs) {
        if (err) {
          return callback(err, false);
        }

        callback(null, !docs.length);
      });
    },

    /**
     * REST handler
     *
     * @param {ServerResponse} res
     * @param {Function} [map] - map data before responding
     */
    rest: function(res, map) {
      var that = this;
      var method = res.req.method;

      return function(err, data, status) {
        if (err) {
          return res.status(500).end();
        }

        var statusCode = null;
        switch(status) {
          case 'invalid': statusCode = 400; break;
        }

        var fin = function() {
          if (method === 'POST') {
            return data ?
              res.status(201)
                .header('Location', '/' + that._path + '/' + data[that._key])
                .json(data) :
              res.status(statusCode || 409).end();
          }

          if (method === 'PUT' && data === null) {
            return res.status(statusCode || 409).end();
          }

          return data ?
            res.status(200).json(data) :
            res.status(404).end();
        };

        if (data && typeof map === 'function') {
          if (map.length === 2) {
            return map(data, fin);
          }

          data = map(data) || data;
        }

        fin();
      };
    },

    /**
     * Insert a new document into the database
     *
     * @param {Object} doc - a document to insert
     * @return {Promise}
     */
    create: function(doc) {
      var that = this;

      if (doc && typeof that._in_map === 'function') {
        doc = that._in_map(doc) || doc;
      }

      if (!this.valid(doc)) {
        return Promise.reject(new Error('Invalid document'));
      }

      return this._init.then(that._dbApi.findMaxIndex).then(function(max) {
        if (typeof max === 'number') {
          doc[that._key] = max;
        }

        return that._dbApi.create(doc);
      });

      // this.admissible(doc, function(err, ok) {
      //   if (!ok) {
      //     return callback(err, null);
      //   }

      //   doc = that.clean(doc);

      //   that._db.find().sort(o(that._key, -1)).limit(1).toArray(function(err, max) {
      //     if (that._auto) {
      //       var maxKey = max[0] ? max[0][that._key] : 0;
      //       doc[that._key] = maxKey + 1;
      //     }

      //     that._db.insert(doc, function(err, doc) {
      //       if (doc && typeof that._out_map === 'function') {
      //         doc = that._out_map(doc) || doc;
      //       }

      //       callback(err, doc);
      //     });
      //   });
      // });
    },

    /**
     * Get a document from the database by key
     *
     * @param {Mixed} id - key for document to get
     * @return {Promise}
     */
    read: function(id) {
      var that = this;

      return this._dbApi.read(id).then(function(doc) {
        return doc && typeof that._out_map === 'function' ? that._out_map(doc) || doc : doc;
      });
    },

    /**
     * Get all documents from the database with matching properties
     *
     * @param {Object} props
     * @return {Promise} -> {Array}
     */
    find: function(props) {
      var that = this;

      return this._dbApi.find(props || {}).then(function(docs) {
        if (docs && typeof that._out_map === 'function') {
          docs = docs.map(function(doc) {
            return that._out_map(doc) || doc;
          });
        }

        return docs;
      });
    },

    /**
     * Get all documents from the database
     *
     * @return {Promise} -> {Array}
     */
    readAll: function() {
      return this.find();
    },

    /**
     * Update a document in the database by key
     *
     * The key and unique values of a document cannot be updated. Remove the
     * document and create a new document instead.
     *
     * @param {Mixed} id - key for document to update
     * @param {Object} updates - updates to apply to document
     * @param {Function} callback(err, {Boolean})
     */
    update: function(id, updates, callback) {
      var that = this;
      updates = updates || {};

      this.read(id, function(err, doc) {
        if (err) {
          return callback(err, null);
        }

        if (!doc) {
          return callback(null, false);
        }

        Object.keys(doc).forEach(function(prop) {
          if (updates.hasOwnProperty(prop)) {
            doc[prop] = updates[prop];
          }
        });

        // null means the document exists but could not be updated
        if (!that.valid(doc)) {
          return callback(null, null, 'invalid');
        }

        // remove key and unique properties
        delete doc[that._key];
        that._uniq.forEach(function(uniq) {
          delete doc[uniq];
        });

        doc = that.clean(doc);

        return that._db.update(o(that._key, id), {
          $set: doc
        }, function(err) {
          if (err) {
            return callback(err, null);
          }

          that.read(id, callback);
        });
      });
    },

    /**
     * Delete a document from the database
     *
     * @param {Mixed} id - key for document to delete
     * @return {Promise}
     */
    delete: function(id, callback) {
      return this._dbApi.delete(id);

/*
      this._db.remove(o(this._key, id || ''), function(err, num) {
        if (err) {
          return callback(err, null);
        }

        var n = typeof num === 'number' ? num : num.n;
        callback(null, n > 0);
      });
*/

    }
  };

  /**
   * Create an object with a variable key
   *
   * @param {Mixed} key
   * @param {Mixed} value
   * @return {Object}
   */
  var o = function(key, value) {
    var obj = {};
    obj[key] = value;

    return obj;
  };

  module.exports = Rudiment;

})();
