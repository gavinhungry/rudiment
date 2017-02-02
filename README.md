rudiment
========
A resource manager providing simplified database methods for CRUD operations.

Installation
------------

    $ npm install rudiment

Usage
-----

```javascript
var Rudiment = require('rudiment');
```

```javascript
var db = require('rethinkdbdash')();
var schema = require('js-schema');

var users = new Rudiment({
  db: db.table('users'),
  schema: schema({
    username: String,
    name: String,
  }),

  key: 'username',
  index: 'uid'
});
```

#### Options
`db`: Existing database table object to use. For `rethinkdb`, the suggested
module is [`rethinkdbdash`](https://www.npmjs.com/package/rethinkdbdash).

`schema`: Optional schema function (or an array of schema functions). These may
be custom predicate functions, or functions returned by a schema library like
[`js-schema`](https://www.npmjs.com/package/js-schema).

`props`: Optional array of whitelisted property names to keep in proposed
documents before creating or updating. If using `js-schema`, this option is not
needed, as the properties will be extracted from the schema.

`key`: Optional property name to be used as unique key.

`index`: Optional property name to use as an auto-index, starting at 0.

`uniq`: Optional array of property names to be considered unique (database ID,
`key` and `index` are automatically included).

`in`: Optional map function for documents being created or updated.

`out`: Optional map function for documents being read.

`path`: Optional REST path.

Methods
-------

### getSupportedDbTypes
Return an array of all supported database types.

```javascript
Rudiment.getSupportedDbTypes();
// ['rethinkdb']
```

### Prototype Methods

All methods may be overridden by the constructor.

### getDbType
Get the detected database type.
```javascript
users.getDbType();
// 'rethinkdb'
```

### getNextIndex
If using auto-indexing (`index`), generate a unique numeric index
(starting at `0`) to use a pseudo-key.

```javascript
users.getNextIndex().then(function(index) {
  // ...
});
```

### clean
Remove extraneous properties from a proposed document. This method only works if
the first defined schema is a `js-schema` object, or if the `props` option is
provided.

```javascript
users.clean({
  username: 'foo',
  name: 'Foo',
  color: 'blue' // this property is not part of the defined schema
});

// { username: 'foo', name: 'Foo' }
```

### isValid
Check if a proposed document is valid by comparing it to the defined schema(s).

```javascript
users.isValid({ username: 'foo', name: 'Foo' });
// true

// `name` should be a String
users.isValid({ username: 'foo', name: 200 });
// false

// Extraneous properties are ignored here
users.isValid({ username: 'foo', name: 'Foo', color: 'green' });
// true
```

### isAdmissible
Check if a proposed document is admissible into the database. An admissible
document should pass `isValid` and not have any unique properties with values
that are already present in the database.

```javascript
users.isAdmissible({
  username: 'foo'
  name: 'Foo'
}).then(function(ok) {
  // `ok` is true if admissible, false otherwise
});
```

### create
Create and insert a new document into the database.

```javascript
users.create({
  username: 'foo',
  name: 'Foo'
}).then(function(doc) {
  // `doc` is newly inserted document
});
```

### find
Get all documents from the database with matching properties.

```javascript
users.find({
  name: 'Foo'
}).then(function(docs) {
  // `docs` is an array of matching documents
});
```

### read
Get a document from the database by database ID.

```javascript
users.read('foo-db-id').then(function(doc) {
  // `doc` is matching document
});
```

### readByKey
Get a document from the database by key.

```javascript
users.readByKey('foo').then(function(doc) {
  // `doc` is matching document
});
```

### readByIndex
Get a document from the database by auto-index.

```javascript
users.readByIndex(0).then(function(doc) {
  // `doc` is matching document
});
```

### readAll
Get all documents from the database.

```javascript
users.readAll().then(function(docs) {
  // `docs` is an array of all documents
});
```

### update
Update a document in the database by database ID.

```javascript
users.update('foo-db-id', {
  name: 'Dr. Foo'
}).then(function(doc) {
  // `doc` is updated document
});
```

### updateByKey
Update a document in the database by key.

```javascript
users.updateByKey('foo', {
  name: 'Dr. Foo'
}).then(function(doc) {
  // `doc` is updated document
});
```

### updateByIndex
Update a document in the database by auto-index.

```javascript
users.updateByIndex(0, {
  name: 'Dr. Foo'
}).then(function(doc) {
  // `doc` is updated document
});
```

### delete
Delete a document from the database by database ID.

```javascript
users.delete('foo-db-id').then(function() {
  // document was deleted
});
```

### deleteByKey
Delete a document from the database by key.

```javascript
users.deleteByKey('foo').then(function() {
  // document was deleted
});
```

### deleteByIndex
Delete a document from the database by auto-index.

```javascript
users.deleteByIndex(0).then(function() {
  // document was deleted
});
```

### rest
Middleware REST handler for CRUD operations.

```javascript
api.post('/users', function(req, res) {
  users.rest(users.create(req.body), res);
});
```

License
-------
This software is released under the terms of the MIT license. See `LICENSE`.
