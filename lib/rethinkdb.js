/**
 * rudiment - CRUD resource manager
 * https://github.com/gavinhungry/rudiment
 */

(function() {
  'use strict';

  module.exports = {
    default: true,
    id: 'id',

    api: function() {
      return {
        init: function() {
          var that = this;

          return this._db.indexList().then(function(indexes) {
            if (indexes.indexOf(that._key) >= 0) {
              return;
            }

            return that._db.indexCreate(that._key);
          });
        },

        findMaxIndex: function() {
          return this._db.orderBy({ index: this._key }).nth(-1).default(0);
        },

        isAdmissible: function(doc, props) {
          return this._db.filter(props).then(function(docs) {
            return docs.length === 0;
          });
        },

        create: function(doc) {
          var that = this;

          return this._db.insert(doc).then(function(res) {
            return res.generated_keys.length ? that.read(res.generated_keys[0]) : null;
          });
        },

        read: function(id) {
          return this._db.get(id);
        },

        update: function(id, doc) {
          return this._db.get(id).update(doc);
        },

        find: function(props) {
          return this._db.filter(props);
        },

        delete: function(id) {
          return this._db.get(id).delete().then(function(res) {
            return res.deleted > 0;
          });
        }
      };
    }
  };

})();
