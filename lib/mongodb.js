/**
 * rudiment - CRUD resource manager
 * https://github.com/gavinhungry/rudiment
 */

(function() {
  'use strict';

  module.exports = {
    id: '_id',

    api: {
      init: function() {
        var dbCursorProto = Object.getPrototypeOf(this._db.find());
        dbCursorProto.toArray = dbCursorProto.toArray || dbCursorProto.exec;
      },

      getNextIndex: function() {
        // resolve with number
      },

      isAdmissible: function(doc, props) {
        // resolve with boolean
      },

      create: function(doc) {
        // resolve with created document
      },

      read: function(id) {
        // resolve with matching document
      },

      update: function(id, doc) {
        // resolve with updated document
      },

      find: function(props) {
        // resolve with matching document(s)
      },

      delete: function(id) {
        // resolve with boolean
      }
    }
  };

})();
