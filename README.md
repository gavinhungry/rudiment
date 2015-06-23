-
========
A simple RESTful resource manager.

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
```javascript
  // Remove extraneous properties from a document

  r.clean({ serial: 123, name: 'foo', gender: 'male' });
  // { serial: 123, name: 'foo' }
```

#### valid
```javascript
  // Check if a document is valid

  r.valid({ serial: 123, name: 'foo' }); // true
  r.valid({ serial: 123, name: 123 }); // false
```

#### admissible
```javascript
  // Check if a document is admissible

  r.create({ serial: 123 name: 'foo', fingerprint: 123 }, function(err, doc) {
    r.admissible({ serial: 456, name: 'bar', fingerprint: 123 }, function(err, ok) {
      // `ok` is false, this fingerprint already exists in the database
    });
  });
```

#### create
```javascript
  // Insert a new document into the database

  r.create({ serial: 123, name: 'foo' }, function(err, doc) {
    // `doc` is `null` if not admissible
  });
```

#### read
```javascript
  // Get a document from the database by key

  r.read(123, function(err, doc) {
    // `doc` is the document in database with a `serial` of `123`, or `null` if not found.
  });
```

#### readAll
```javascript
  // Get all documents from the database

  r.readAll(function(err, docs) {
    // `docs` is an array of documents
  });
```

#### update
```javascript
  // Update a document in the database by key

  r.update(123, { name: 'bar' }, function(err, updated) {
    // updated is `true` if a document was updated, `false` otherwise
  });
```

#### remove
```javascript
  // Delete a document from the database

  r.remove(123, function(err, removed) {
    // removed is `true` if a document was deleted, `false` otherwise
  });
```

License
-------
Released under the terms of the
[MIT license](http://tldrlegal.com/license/mit-license). See **LICENSE**.
