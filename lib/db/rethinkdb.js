/**
 * rudiment - A simple CRUD resource manager
 * https://github.com/gavinhungry/rudiment
 */

(function() {
  'use strict';

  module.exports = {
    id: 'id',
    filter: function() {
      return this.hasOwnProperty('conn');
    },
    methods: {
      create: function() {},

      read: function(id) {
        return this._db.table.get(id).run(this._db.conn);
      },

      update: function() {},
      delete: function() {}
    }
  };
})();
