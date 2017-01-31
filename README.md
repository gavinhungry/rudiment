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
var employees = new Rudiment({
  db: db.employees,
  schema: require('js-schema')({
    username: String,
    employeeId: Number
  })
});
```

#### Options

`db`

`schema`

`props`

`key`

`uniq`

`in`

`out`

`auto`

Methods
-------

### getSupportedDbTypes
Return an array of all supported database types.

```javascript
Rudiment.getSupportedDbTypes();
// ['rethinkdb']
```

### Prototype Methods

All methods can be overridden by the constructor.

### getDbType
Get the detected database type.
```javascript
crud.getDbType();
// 'rethinkdb'
```

### clean
Remove extraneous properties from a document.

```javascript
crud.clean({
  username: 'foo',
  age: 21
  color: blue
});

// { username: 'foo', age: 18 }
```

### getNextKey
If using [auto-indexing](#options) (`auto`), generate a unique numeric index to use a pseudo-key. If `auto` is not set, this function always returns a promise resolving to `null`.

```javascript
crud.getNextKey().then(function(index) { /* ... */ });
```

### isValid
Check if a document is valid.

```javascript
crud.valid({ username: 'foo', age: 20 });
// true

crud.valid({ username: 'bar', age: 'This should be a number' });
// false
```

### isAdmissible
Check if a document is admissible into the database. An admissible document is one that passes `isValid`, and does not have any unique keys that are already present in the database.

```javascript
crud.create({
  username: 'foo',
  age:
});
```


### create

Insert a new document into the database.

```javascript
r.create({ serial: 123, name: 'foo' }, function(err, doc) {
  // `doc` is `null` if not admissible
});
```

### read

Get a document from the database by key.

```javascript
r.read(123, function(err, doc) {
  // `doc` is the document in database with a `serial` of `123`, or `null` if not found.
});
```

### readByDbId

### find

### readAll

Get all documents from the database.

```javascript
r.readAll(function(err, docs) {
  // `docs` is an array of documents
});
```

### update

Update a document in the database by key.

```javascript
r.update(123, { name: 'bar' }, function(err, updated) {
  // updated is `true` if a document was updated, `false` otherwise
});
```

### delete

Delete a document from the database.

```javascript
r.delete(123, function(err, removed) {
  // removed is `true` if a document was deleted, `false` otherwise
});
```

### rest

A REST handler for `ServerResponse` objects.

```javascript
api.post('/people', function(req, res) {
  r.create(req.body, r.rest(res));
  // person URI is provided by Location response header
});
```


License
-------
This software is released under the terms of the MIT license. See `LICENSE`.
