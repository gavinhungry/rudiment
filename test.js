var err = function(err) {
  return console.error('ERR', err);
};

var ok = function(data) {
  return console.log('OK', data);
};

var Rudiment = require('./rudiment.js');
var jsSchema = require('js-schema');

var rethinkdbdash = require('rethinkdbdash');
var rethink = rethinkdbdash();

var users = new Rudiment({
  db: rethink.table('users'),
  schema: jsSchema({
    username: String,
    name: String,
    age: Number.min(0).max(100),
    color: ['green', 'blue']
  }),

  auto: 'uid'
});
