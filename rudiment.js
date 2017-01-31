/**
 * rudiment - CRUD resource manager
 * https://github.com/gavinhungry/rudiment
 */

(function() {
  'use strict';

  var pkg = require('./package.json');

  var dbTypes = pkg.dbModules.map(function(dbModule) {
    var dbType = require('./lib/' + dbModule + '.js');
    dbType.name = dbModule;

    return dbType;
  });

  var defaultDbType = dbTypes.find(function(dbType) {
    return dbType.default;
  });

  /**
   * Given a database object, get the database type
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
   * Return a copy of an object with only the picked keys
   *
   * @param {Object} obj
   * @param {Array} keys
   * @return {Object}
   */
  var pick = function(obj, keys) {
    return keys.reduce(function(memo, key) {
      if (obj[key] !== undefined) {
        memo[key] = obj[key];
      }

      return memo;
    }, {});
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

    this._dbApi = this._dbType.api;
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

    getNextKey: function() {
      if (!this._auto) {
        return Promise.resolve(null);
      }

      return this._dbApi.getNextKey();
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
    isValid: function(doc) {
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
     * @return {Promise}
     */
    isAdmissible: function(doc) {
      if (!this.isValid(doc)) {
        return Promise.resolve(false);
      }

      var props = pick(doc, this._uniq);
      if (!Object.keys(props).length) {
        return Promise.resolve(true);
      }

      return this._dbApi.isAdmissible(doc, props);
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

      return this._init.then(function() {
        return that.isAdmissible(doc);
      }).then(function(admissible) {
        if (!admissible) {
          throw new Error('Document not admissible');
        }

        doc = that.clean(doc);

        return that.getNextKey();
      }).then(function(max) {
        if (typeof max === 'number') {
          doc[that._key] = max;
        }

        return that._dbApi.create(doc).then(function(doc) {
          if (!doc) {
            throw new Error('Document not created');
          }

          return doc;
        });
      });
    },

    /**
     * Get a document from the database by key
     *
     * @param {Number} key
     * @return {Promise}
     */
    read: function(key) {
      if (!this._auto) {
        return Promise.reject(new Error('No auto key specified'));
      }

      var props = {};
      props[this._key] = parseInt(key, 10);

      return this._dbApi.find(props).then(function(docs) {
        return docs[0];
      });
    },

    /**
     * Get a document from the database by key
     *
     * @param {Mixed} id - key for document to get
     * @return {Promise}
     */
    readByDbId: function(id) {
      var that = this;

      return this._dbApi.read(id).then(function(doc) {
        if (!doc) {
          throw new Error('Document not found');
        }

        return typeof that._out_map === 'function' ? that._out_map(doc) || doc : doc;
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
     * The key and unique values of a document cannot be updated with this
     * method. Delete the document and create a new document instead.
     *
     * @param {Mixed} id - key for document to update
     * @param {Object} updates - updates to apply to document
     * @return {Promise}
     */
    update: function(id, updates) {
      var that = this;
      updates = updates || {};

      return this.read(id).then(function(doc) {
        Object.keys(doc).forEach(function(prop) {
          if (updates.hasOwnProperty(prop)) {
            doc[prop] = updates[prop];
          }
        });

        if (!that.isValid(doc)) {
          throw new Error('Updated document is invalid');
        }

        delete doc[that._key];
        that._uniq.forEach(function(uniq) {
          delete doc[uniq];
        });

        doc = that.clean(doc);
        return that._dbApi.update(id, doc);
      });
    },

    /**
     * Delete a document from the database
     *
     * @param {Mixed} id - key for document to delete
     * @return {Promise}
     */
    delete: function(id) {
      return this._dbApi.delete(id).then(function(deleted) {
        if (!deleted) {
          throw new Error('Document not found');
        }
      });
    },

    /**
     * REST handler
     *
     * @param {Promise} operation
     * @param {ServerResponse} res
     * @param {Array} [removeProps] properties to remove
     */
    rest: function(operation, res, removeProps) {
      var that = this;
      var method = res.req.method;

      return operation.then(function(doc) {
        delete doc[that._key];
        delete doc[that._dbType.id];
        if (removeProps) {
          removeProps.forEach(function(prop) {
            delete doc[prop];
          });
        }

        if (method === 'POST') {
          if (that._path) {
            res.header('Location', '/' + that._path + '/' + doc[that._key]);
          }

          return res.status(201).json(doc);
        }

        return res.status(200).json(doc);
      }, function(err) {
        console.error(err.message);

        if (method === 'POST' || method === 'PUT') {
          return res.status(409).end();
        }

        if (method === 'GET') {
          res.status(404).end();
        }

        return res.status(500).end();
      });
    }
  };

  module.exports = Rudiment;

})();
