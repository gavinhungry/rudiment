/**
 * rudiment - A simple RESTful resource manager
 * https://github.com/gavinhungry/rudiment
 */

(function() {
  'use strict';

  /**
   * @constructor for Rudiments
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

    this._schema = opts.schema;

    // attempt to get props from the passed schema
    var schemaProps;
    if (this._schema && this._schema.toJSON) {
      var obj = this._schema.toJSON();
      if (obj && obj.properties) {
        schemaProps = Object.keys(obj.properties);
      }
    }

    this._key = opts.key || (schemaProps ? schemaProps[0] : null) || '_id';
    this._props = opts.props || schemaProps;
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
      return this._schema ? this._schema(doc) : true;
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
     * Insert a new document into the database
     *
     * @param {Object} doc - a document to insert
     * @param {Function} callback(err, {Object|null})
     */
    create: function(doc, callback) {
      var that = this;

      this.admissible(doc, function(err, ok) {
        if (!ok) {
          return callback(err, null);
        }

        doc = that.clean(doc);
        that._db.insert(doc, callback);
      });
    },

    /**
     * Get a document from the database by key
     *
     * @param {Mixed} id - key for document to get
     * @param {Function} callback(err, {Object|null})
     */
    read: function(id, callback) {
      this._db.findOne(o(this._key, id), callback);
    },

    /**
     * Get all documents from the database
     *
     * @param {Function} callback(err, {Array})
     */
    readAll: function(callback) {
      this._db.find({}, callback);
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
          return callback(err);
        }

        if (!doc) {
          return callback(null, false);
        }

        Object.keys(doc).forEach(function(prop) {
          if (updates.hasOwnProperty(prop)) {
            doc[prop] = updates[prop];
          }
        });

        if (that.valid(doc)) {
          // remove key and unique properties
          delete doc[that._key];
          that._uniq.forEach(function(uniq) {
            delete doc[uniq];
          });

          return that._db.update(o(that._key, id), {
            $set: doc
          }, function(err, num) {
            if (err) {
              return callback(err);
            }

            callback(null, num > 0);
          });
        }

        callback(null, false);
      });
    },

    /**
     * Delete a document from the database
     *
     * @param {Mixed} id - key for document to delete
     * @param {Function} callback(err, {Boolean})
     */
    delete: function(id, callback) {
      this._db.remove(o(this._key, id), function(err, num) {
        if (err) {
          return callback(err);
        }

        callback(null, num > 0);
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
