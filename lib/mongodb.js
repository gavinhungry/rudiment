/**
 * rudiment - CRUD resource manager
 * https://github.com/gavinhungry/rudiment
 */

(function() {
  'use strict';

  module.exports = {
    id: '_id',

    init: function() {
      var dbCursorProto = Object.getPrototypeOf(this._db.find());
      dbCursorProto.toArray = dbCursorProto.toArray || dbCursorProto.exec;
    },

    methods: {
      create: function() {},

      read: function(id) {
        var that = this;

        return new Promise(function(res, rej) {
          that._db.findOne(o(that._key, id || ''), function(err, doc) {
            return err ? rej(err) : res(doc);
          });
        });
      },

      find: function(props) {
        var that = this;

        return new Promise(function(res, rej) {
          that._db.find(props || {}).sort(o(that._key, 1)).toArray(function(err, docs) {
            return err ? rej(err) : res(docs);
          });
        });
      },

      update: function() {},
      delete: function() {}
    }
  };

})();
