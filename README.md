rudiment
========
A simple CRUD resource manager.

Installation
------------

    $ npm install rudiment

Usage
-----

```javascript
var Rudiment = require('rudiment');
```

```javascript
var r = new Rudiment({
  // a MongoDB-like database
  db: db.people,

  // optional REST path
  path: 'person',

  // a predicate function to determine validity
  schema: function(doc) {
    return typeof doc.name === 'string';
  },

  // an array of keys to filter out before saving a new document
  props: ['fingerprint', 'retina', 'name', 'address']

  // a key to be considered the id for a document
  key: 'serial',

  // an array of keys which are considered unique
  uniq: ['fingerprint', 'retina'],
});
```

### Methods

All methods can be overridden in the constructor.

#### clean

Remove extraneous properties from a document.

```javascript
r.clean({ serial: 123, name: 'foo', gender: 'male' });
// { serial: 123, name: 'foo' }
```

#### valid

Check if a document is valid.

```javascript
r.valid({ serial: 123, name: 'foo' }); // true
r.valid({ serial: 123, name: 123 }); // false
```

#### admissible

Check if a document is admissible.

```javascript
r.create({ serial: 123 name: 'foo', fingerprint: 123 }, function(err, doc) {
  r.admissible({ serial: 456, name: 'bar', fingerprint: 123 }, function(err, ok) {
    // `ok` is false, this fingerprint already exists in the database
  });
});
```

#### rest

A REST handler for `ServerResponse` objects.

```javascript
api.post('/people', function(req, res) {
  r.create(req.body, r.rest(res));
  // person URI is provided by Location response header
});
```

#### create

Insert a new document into the database.

```javascript
r.create({ serial: 123, name: 'foo' }, function(err, doc) {
  // `doc` is `null` if not admissible
});
```

#### read

Get a document from the database by key.

```javascript
r.read(123, function(err, doc) {
  // `doc` is the document in database with a `serial` of `123`, or `null` if not found.
});
```

#### readAll

Get all documents from the database.

```javascript
r.readAll(function(err, docs) {
  // `docs` is an array of documents
});
```

#### update

Update a document in the database by key.

```javascript
r.update(123, { name: 'bar' }, function(err, updated) {
  // updated is `true` if a document was updated, `false` otherwise
});
```

#### remove

Delete a document from the database.

```javascript
r.delete(123, function(err, removed) {
  // removed is `true` if a document was deleted, `false` otherwise
});
```
License
-------
Released under the terms of the
[MIT license](http://tldrlegal.com/license/mit-license). See **LICENSE**.
