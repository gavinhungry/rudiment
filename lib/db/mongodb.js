/**
 * rudiment - A simple CRUD resource manager
 * https://github.com/gavinhungry/rudiment
 */

(function() {
  'use strict';

  module.exports = {
    default: true,
    id: '_id',
    methods: {
      create: function() {},

      read: function(id) {
        var that = this;

        return new Promise(function(res, rej) {
          that._db.findOne(o(that._key, id || ''), function(err, doc) {
            if (err) {
              return rej(err);
            }

            if (doc && typeof that._out_map === 'function') {
              doc = that._out_map(doc) || doc;
            }

            res(doc);
          });
        });
      },

      update: function() {},
      delete: function() {}
    }
  };

})();
