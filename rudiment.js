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
   * Create a map function that maps the value or returns the original value
   *
   * @param {Function} [map]
   * @return {Function}
   */
  var mapOrSelf = function(map) {
    return function(val) {
      return typeof map === 'function' ? (map(val) || val) : val;
    };
  };

  /**
   * @constructor for Rudiment objects
   *
   * Rudiment objects have prototype methods that can be overridden in this
   * constructor as needed.
   *
   * The schema is a predicate function (or array of functions) that determines
   * the validity of a candidate document. The props array is filled
   * automatically if possible.
   *
   * @param {Object} opts
   * @param {Object} opts.db - database table
   * @param {Function|Array} [opts.schema] - predicate function(s) for schema validation
   * @param {Array} [opts.props] - whitelisted properties (extracted from schema if possible)
   * @param {String} [opts.key] - key property name (must be defined to use `byKey` methods)
   * @param {String} [opts.index] - auto-index property name (must be defined to use `byIndex` methods)
   * @param {Array} [opts.uniq] - unique property names (includes `key` and `index`)
   * @param {Function} [opts.in] - map for documents created or updated
   * @param {Function} [opts.out] - map for documents read
   * @param {String} [opts.path] - REST path
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

    // attempt to get props from the passed schema
    var schemaProps;
    if (this._schema[0] && this._schema[0].toJSON) {
      var obj = this._schema[0].toJSON();
      if (obj && obj.properties) {
        schemaProps = Object.keys(obj.properties);
      }
    }

    this._props = opts.props || schemaProps;

    this._key = opts.key;
    this._index = opts.index;

    this._uniq = [
      this._dbType.id,
      this._key,
      this._index
    ].concat(opts.uniq).filter(function(prop) {
      return prop;
    });

    this._in_map = mapOrSelf(opts.in);
    this._out_map = mapOrSelf(opts.out);
    this._path = opts.path;

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
     * If using auto-indexing, generate a unique numeric index (starting at 0)
     * to use a pseudo-key
     *
     * @return {Promise}
     */
    getNextIndex: function() {
      if (!this._index) {
        return Promise.reject(new Error('No auto-indexing key specified'));
      }

      return this._dbApi.getNextIndex();
    },

    /**
     * Remove extraneous properties from a proposed document
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
     * Check if a proposed document is valid by comparing it to the defined
     * schema(s)
     *
     * If no schema is defined, always returns true.
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
     * Check if a proposed document is admissible into the database
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
     * Create and insert a new document into the database
     *
     * @param {Object} doc - a document to insert
     * @return {Promise}
     */
    create: function(doc) {
      var that = this;
      doc = that._in_map(doc);

      return this._init.then(function() {
        return that.isAdmissible(doc);
      }).then(function(admissible) {
        if (!admissible) {
          throw new Error('Document not admissible');
        }

        doc = that.clean(doc);

        if (that._index) {
          delete doc[that._index];
        }

        return that.getNextIndex();
      }).then(function(max) {
        if (that._index && typeof max === 'number') {
          doc[that._index] = max;
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
     * Get all documents from the database with matching properties
     *
     * @param {Object} props
     * @return {Promise} -> {Array}
     */
    find: function(props) {
      var that = this;

      return this._dbApi.find(props || {}).then(function(docs) {
        return docs.map(that._out_map);
      });
    },

    _readDoc: function(doc) {
      if (!doc) {
        throw new Error('Document not found');
      }

      return this._out_map(doc);
    },

    /**
     * Get a document from the database by database ID
     *
     * @param {String} id
     * @return {Promise}
     */
    read: function(id) {
      var that = this;

      return this._dbApi.read(id).then(function(doc) {
        return that._readDoc(doc);
      });
    },

    /**
     * Get a document from the database by key
     *
     * @param {String} key
     * @return {Promise}
     */
    readByKey: function(key) {
      var that = this;

      if (!this._key || !key) {
        return Promise.reject(new Error('No unique key specified'));
      }

      var props = {};
      props[this._key] = key;

      return this._dbApi.find(props).then(function(docs) {
        return that._readDoc(docs[0]);
      });
    },

    /**
     * @private
     */
    _propIndex: function(index) {
      if (!this._index) {
        return null;
      }

      var indexInt = parseInt(index, 10);
      if (typeof indexInt !== 'number' || !isFinite(indexInt)) {
        return null;
      }

      var props = {};
      props[this._index] = indexInt;

      return props;
    },

    /**
     * Get a document from the database by auto-index
     *
     * @param {Number|String} index
     * @return {Promise}
     */
    readByIndex: function(index) {
      var that = this;

      var props = this._propIndex(index);
      if (!props) {
        return Promise.reject(new Error('No auto-indexing key specified'));
      }

      return this._dbApi.find(props).then(function(docs) {
        return that._readDoc(docs[0]);
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
     * Update an existing database document
     *
     * The unique values of a document cannot be updated with this method.
     * Delete the document and create a new document instead.
     *
     * @private
     *
     * @param {Document} doc
     * @param {Object} updates - updates to apply to document
     * @return {Promise}
     */
    _updateDoc: function(doc, updates) {
      updates = this._in_map(updates || {});

      Object.keys(doc).forEach(function(prop) {
        if (updates.hasOwnProperty(prop)) {
          doc[prop] = updates[prop];
        }
      });

      if (!this.isValid(doc)) {
        throw new Error('Updated document is invalid');
      }

      var id = doc[this._dbType.id];

      this._uniq.forEach(function(uniq) {
        delete doc[uniq];
      });

      doc = this.clean(doc);
      return this._dbApi.update(id, doc);
    },

    /**
     * Update a document in the database by database ID
     *
     * @param {String} id
     * @param {Object} updates - updates to apply to document
     * @return {Promise}
     */
    update: function(id, updates) {
      var that = this;

      return this.read(id).then(function(doc) {
        return that._updateDoc(doc, updates);
      });
    },

    /**
     * Update a document in the database by key
     *
     * @param {String} key
     * @param {Object} updates - updates to apply to document
     * @return {Promise}
     */
    updateByKey: function(key, updates) {
      var that = this;

      if (!this._key || !key) {
        return Promise.reject(new Error('No unique key specified'));
      }

      return this.readByKey(key).then(function(doc) {
        return that._updateDoc(doc, updates);
      });
    },

    /**
     * Update a document in the database by auto-index
     *
     * @param {Number|String} index
     * @param {Object} updates - updates to apply to document
     * @return {Promise}
     */
    updateByIndex: function(index, updates) {
      var that = this;

      return this.readByIndex(index).then(function(doc) {
        return that._updateDoc(doc, updates);
      });
    },

    /**
     * Delete a document from the database
     *
     * @param {String} id
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
     * Delete a document from the database by key
     *
     * @param {String} key
     * @return {Promise}
     */
    deleteByKey: function(key) {
      var that = this;

      if (!this._key || !key) {
        return Promise.reject(new Error('No unique key specified'));
      }

      return this.readByKey(key).then(function(doc) {
        return that.delete(doc[that._dbType.id]);
      });
    },

    /**
     * Delete a document from the database by auto-index
     *
     * @param {Number|String} index
     * @return {Promise}
     */
    deleteByIndex: function(index) {
      var that = this;

      return this.readByIndex(index).then(function(doc) {
        return that.delete(doc[that._dbType.id]);
      });
    },

    /**
     * Middleware REST handler for CRUD operations
     *
     * @param {Promise} operation
     * @param {ServerResponse} res
     */
    rest: function(operation, res) {
      var that = this;
      var method = res.req.method;

      return operation.then(function(doc) {
        if (method === 'POST') {
          if (that._path && (that._key || that._index)) {
            res.header('Location', '/' + that._path + '/' + doc[that._key || that._index]);
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
