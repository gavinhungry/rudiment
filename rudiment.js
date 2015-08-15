/**
 * rudiment - A simple CRUD resource manager
 * https://github.com/gavinhungry/rudiment
 */

(function() {
  'use strict';

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
   * @param {String} [opts.key] - document key in database (defaults to first prop or '_id')
   * @param {Array} [opts.uniq] - document properties to consider unique
   */
  var Rudiment = function(opts) {
    var that = this;
    opts = opts || {};

    this._db = opts.db;
    if (!this._db) {
      throw new Error('No database provided');
    }

    var dbCursorProto = Object.getPrototypeOf(this._db.find());
    dbCursorProto.toArray = dbCursorProto.toArray || dbCursorProto.exec;

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
    this._key = opts.key || (schemaProps ? schemaProps[0] : null) || '_id';
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
  };

  Rudiment.prototype = {
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
        obj[prop] = doc[prop];
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
      var i;

      for (i = 0; i < this._schema.length; i++) {
        if (!this._schema[i](doc)) {
          return false;
        }
      }

      return true;
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

        if (typeof map === 'function') {
          if (data) {
            data = map(data) || data;
          }
        }

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
    },

    /**
     * Insert a new document into the database
     *
     * @param {Object} doc - a document to insert
     * @param {Function} callback(err, {Object|null})
     */
    create: function(doc, callback) {
      var that = this;

      if (doc && typeof that._in_map === 'function') {
        doc = that._in_map(doc) || doc;
      }

      if (!this.valid(doc)) {
        return callback(null, null, 'invalid');
      }

      this.admissible(doc, function(err, ok) {
        if (!ok) {
          return callback(err, null);
        }

        doc = that.clean(doc);

        that._db.find().sort(o(that._key, -1)).limit(1).toArray(function(err, max) {
          if (that._auto) {
            var maxKey = max[0] ? max[0][that._key] : 0;
            doc[that._key] = maxKey + 1;
          }

          that._db.insert(doc, function(err, doc) {
            if (doc && typeof that._out_map === 'function') {
              doc = that._out_map(doc) || doc;
            }

            callback(err, doc);
          });
        });
      });
    },

    /**
     * Get a document from the database by key
     *
     * @param {Mixed} id - key for document to get
     * @param {Function} callback(err, {Object|null})
     */
    read: function(id, callback) {
      var that = this;

      this._db.findOne(o(this._key, id || ''), function(err, doc) {
        if (doc && typeof that._out_map === 'function') {
          doc = that._out_map(doc) || doc;
        }

        callback(err, doc);
      });
    },

    /**
     * Get all documents from the database
     *
     * @param {Function} callback(err, {Array})
     */
    readAll: function(callback) {
      var that = this;

      this._db.find({}).sort(o(this._key, 1)).toArray(function(err, docs) {
        if (docs && typeof that.__out_map === 'function') {
          docs = docs.map(function(doc) {
            return that._out_map(doc) || doc;
          });
        }

        callback(err, docs);
      });
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
     * @param {Function} callback(err, {Boolean})
     */
    delete: function(id, callback) {
      this._db.remove(o(this._key, id || ''), function(err, num) {
        if (err) {
          return callback(err, null);
        }

        var n = typeof num === 'number' ? num : num.n;
        callback(null, n > 0);
      });
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
