var _ = require('@sailshq/lodash');
var he = require('he');
_.str = require('underscore.string');
var XRegExp = require('xregexp').XRegExp;
var crypto = require('crypto');
var cuid = require('cuid');
var fs = require('fs');

module.exports = function(self, options) {

  // generate a unique identifier for a new page or other object.
  // IDs are generated with the cuid module which prevents
  // collisions and easy guessing of another's ID.

  self.generateId = function() {
    return cuid();
  };

  // Globally replace a string with another string.
  // Regular `String.replace` does NOT offer global replace, except
  // when using regular expressions, which are great but
  // problematic when UTF8 characters may be present.

  self.globalReplace = function(haystack, needle, replacement) {
    var result = '';
    while (true) {
      if (!haystack.length) {
        return result;
      }
      var index = haystack.indexOf(needle);
      if (index === -1) {
        result += haystack;
        return result;
      }
      result += haystack.substr(0, index);
      result += replacement;
      haystack = haystack.substr(index + needle.length);
    }
  };

  // Truncate a plaintext string at the specified number of
  // characters without breaking words if possible, see
  // underscore.string's prune function, of which this is
  // a copy (but replacing RegExp with XRegExp for
  // better UTF-8 support)
  //
  self.truncatePlaintext = function(str, length, pruneStr) {
    if (str == null) return '';

    str = String(str); length = ~~length;
    pruneStr = pruneStr != null ? String(pruneStr) : '...';

    if (str.length <= length) return str;

    // XRegExp is different.
    // eslint-disable-next-line no-useless-escape
    var r = '.(?=\W*\w*$)';
    var regex = new XRegExp(r, 'g');

    function tmpl(c) {
      return c.toUpperCase() !== c.toLowerCase() ? 'A' : ' ';
    };

    var template = str.slice(0, length + 1);
    template = XRegExp.replace(template, regex, tmpl); // 'Hello, world' -> 'HellAA AAAAA'

    if (template.slice(template.length - 2).match(/\w\w/)) { template = template.replace(/\s*\S+$/, ''); } else { template = _.str.rtrim(template.slice(0, template.length - 1)); }

    return (template + pruneStr).length > str.length ? str : str.slice(0, template.length) + pruneStr;
  };

  // Escape a plaintext string correctly for use in HTML.
  // If `{ pretty: true }` is in the options object,
  // newlines become br tags, and URLs become links to
  // those URLs. Otherwise we just do basic escaping.
  //
  // If `{ single: true }` is in the options object,
  // single-quotes are escaped, otherwise double-quotes
  // are escaped.
  //
  // For bc, if the second argument is truthy and not an
  // object, `{ pretty: true }` is assumed.

  self.escapeHtml = function(s, options) {
    // for bc
    if (options && (typeof (options) !== 'object')) {
      options = { pretty: true };
    }
    options = options || {};
    if (s === 'undefined') {
      s = '';
    }
    if (typeof (s) !== 'string') {
      s = s + '';
    }
    s = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    if (options.single) {
      s = s.replace(/'/g, '&#39;');
    } else {
      s = s.replace(/"/g, '&#34;');
    }
    if (options.pretty) {
      s = s.replace(/\r?\n/g, "<br />");
      // URLs to links. Careful, newlines are already <br /> at this point
      s = s.replace(/https?:[^\s<]+/g, function(match) {
        match = match.trim();
        return '<a href="' + self.escapeHtml(match) + '">' + match + '</a>';
      });
    }
    return s;
  };

  // Convert HTML to true plaintext, with all entities decoded.

  self.htmlToPlaintext = function(html) {
    // The awesomest HTML renderer ever (look out webkit):
    // block element opening tags = newlines, closing tags and non-container tags just gone
    html = html.replace(/<\/.*?>/g, '');
    html = html.replace(/<(h1|h2|h3|h4|h5|h6|p|br|blockquote|li|article|address|footer|pre|header|table|tr|td|th|tfoot|thead|div|dl|dt|dd).*?>/gi, '\n');
    html = html.replace(/<.*?>/g, '');
    return he.decode(html);
  };

  // Capitalize the first letter of a string.

  self.capitalizeFirst = function(s) {
    return s.charAt(0).toUpperCase() + s.substr(1);
  };

  // Convert other name formats such as underscore and camelCase to a hyphenated css-style
  // name.

  self.cssName = function(camel) {
    // Keep in sync with client side version
    var i;
    var css = '';
    var dash = false;
    for (i = 0; (i < camel.length); i++) {
      var c = camel.charAt(i);
      var lower = ((c >= 'a') && (c <= 'z'));
      var upper = ((c >= 'A') && (c <= 'Z'));
      var digit = ((c >= '0') && (c <= '9'));
      if (!(lower || upper || digit)) {
        dash = true;
        continue;
      }
      if (upper) {
        if (i > 0) {
          dash = true;
        }
        c = c.toLowerCase();
      }
      if (dash) {
        css += '-';
        // Preserve double dash if they were literal dashes.
        // This is common in modern CSS patterns
        if ((i >= 2) && (camel.substr(i - 2, 2) === '--')) {
          css += '-';
        }
        dash = false;
      }
      css += c;
    }
    return css;
  };

  // Convert a name to camel case.
  //
  // Useful in converting CSV with friendly headings into sensible property names.
  //
  // Only digits and ASCII letters remain.
  //
  // Anything that isn't a digit or an ASCII letter prompts the next character
  // to be uppercase. Existing uppercase letters also trigger uppercase, unless
  // they are the first character; this preserves existing camelCase names.

  self.camelName = function(s) {
    // Keep in sync with client side version
    var i;
    var n = '';
    var nextUp = false;
    for (i = 0; (i < s.length); i++) {
      var c = s.charAt(i);
      // If the next character is already uppercase, preserve that, unless
      // it is the first character
      if ((i > 0) && c.match(/[A-Z]/)) {
        nextUp = true;
      }
      if (c.match(/[A-Za-z0-9]/)) {
        if (nextUp) {
          n += c.toUpperCase();
          nextUp = false;
        } else {
          n += c.toLowerCase();
        }
      } else {
        nextUp = true;
      }
    }
    return n;
  };

  // Add a slash to a path, but only if it does not already end in a slash.

  self.addSlashIfNeeded = function(path) {
    path += '/';
    path = path.replace(/\/\/$/, '/');
    return path;
  };

  // An id for this particular Apostrophe instance that should be
  // unique even in a multiple server environment.
  self.apos.pid = self.generateId();

  // Perform an md5 checksum on a string. Returns hex string.
  self.md5 = function(s) {
    var md5 = crypto.createHash('md5');
    md5.update(s);
    return md5.digest('hex');
  };

  // perform an md5 checksum on a file. Delivers `null`, `hexString` to callback.
  self.md5File = function(filename, callback) {
    var md5 = crypto.createHash('md5');

    var s = fs.ReadStream(filename);

    s.on('data', function(d) {
      md5.update(d);
    });

    s.on('error', function(err) {
      return callback(err);
    });

    s.on('end', function() {
      var d = md5.digest('hex');
      return callback(null, d);
    });
  };

  // Get file size in bytes. On success, delivers `(null, integer)` to callback.

  self.fileLength = function(filename, callback) {
    return fs.stat(filename, function(err, stats) {
      if (err) {
        return callback(err);
      }
      return callback(null, stats.size);
    });
  };

  // Turn the provided string into a string suitable for use as a slug.
  // ONE punctuation character normally forbidden in slugs may
  // optionally be permitted by specifying it via options.allow.
  // The separator may be changed via options.separator.

  self.slugify = function(s, options) {
    return require('sluggo')(s, options);
  };

  // Returns a string that, when used for indexes, behaves
  // similarly to MySQL's default behavior for sorting, plus a little
  // extra tolerance of punctuation and whitespace differences. This is
  // in contrast to MongoDB's default "absolute match with same case only"
  // behavior which is no good for most practical purposes involving text.
  //
  // The use of this method to create sortable properties like
  // "titleSortified" is encouraged. It should not be used for full text
  // search, as MongoDB full text search is now available (see the
  // "search" option to apos.get and everything layered on top of it).
  // It is however used as part of our "autocomplete" search implementation.

  self.sortify = function(s) {
    return self.slugify(s, { separator: ' ' });
  };

  // Turns a user-entered search query into a regular expression.
  // If the string contains multiple words, at least one space is
  // required between them in matching documents, but additional words
  // may also be skipped between them, up to a reasonable limit to
  // preserve performance and avoid useless strings.
  //
  // Although we now have MongoDB full text search this is still
  // a highly useful method, for instance to locate autocomplete
  // candidates via highSearchWords.
  //
  // If the prefix flag is true the search matches only at the start.

  self.searchify = function(q, prefix) {
    q = self.sortify(q);
    if (prefix) {
      q = '^' + q;
    }
    q = q.replace(/ /g, ' .{0,20}?');
    q = new RegExp(q);
    return q;
  };

  // Clone the given object recursively, discarding all
  // properties whose names begin with `_` except
  // for `_id`. Returns the clone.
  //
  // This removes the output of joins and
  // other dynamic loaders, so that dynamically available
  // content is not stored redundantly in MongoDB.
  //
  // If the object is an array, the clone is also an array.
  //
  // Date objects are cloned as such. All other non-JSON
  // objects are cloned as plain JSON objects.
  //
  // If `keepScalars` is true, properties beginning with `_`
  // are kept as long as they are not objects. This is useful
  // when using `clonePermanent` to limit JSON inserted into
  // browser attributes, rather than filtering for the database.
  // Preserving simple string properties like `._url` is usually
  // a good thing in the former case.
  //
  // Arrays are cloned as such only if they are true arrays
  // (Array.isArray returns true). Otherwise all objects with
  // a length property would be treated as arrays, which is
  // an unrealistic restriction on apostrophe doc schemas.

  self.clonePermanent = function(o, keepScalars) {
    var c;
    var isArray = Array.isArray(o);
    if (isArray) {
      c = [];
    } else {
      c = {};
    }

    function iterator(val, key) {
      // careful, don't crash on numeric keys
      if (typeof key === 'string') {
        if ((key.charAt(0) === '_') && (key !== '_id')) {
          if ((!keepScalars) || (typeof val === 'object')) {
            return;
          }
        }
      }
      if ((val === null) || (val === undefined)) {
        // typeof(null) is object, sigh
        c[key] = null;
      } else if (typeof (val) !== 'object') {
        c[key] = val;
      } else if (val instanceof Date) {
        c[key] = new Date(val);
      } else {
        c[key] = self.clonePermanent(val, keepScalars);
      }
    }

    if (isArray) {
      _.each(o, iterator);
    } else {
      _.forOwn(o, iterator);
    }
    return c;
  };

  // `ids` should be an array of mongodb IDs. The elements of the `items` array, which
  // should be the result of a mongodb query, are returned in the order specified by `ids`.
  // This is useful after performing an `$in` query with MongoDB (note that `$in` does NOT sort its
  // strings in the order given).
  //
  // Any IDs that do not actually exist for an item in the `items` array are not returned,
  // and vice versa. You should not assume the result will have the same length as
  // either array.
  //
  // Optionally you may specify a property name other than _id as the third argument.
  // You may use dot notation in this argument.

  self.orderById = function(ids, items, idProperty) {
    if (idProperty === undefined) {
      idProperty = '_id';
    }
    var byId = {};
    _.each(items, function(item) {
      var value = item;
      var keys = idProperty.split('.');
      _.each(keys, function(key) {
        value = value[key];
      });
      byId[value] = item;
    });
    items = [];
    _.each(ids, function(_id) {
      if (_.has(byId, _id)) {
        items.push(byId[_id]);
      }
    });
    return items;
  };

  self.regExpQuote = require('regexp-quote');

  // Return true if `req` is an AJAX request (`req.xhr` is set, or
  // `req.query.xhr` is set to emulate it, or `req.query.apos_refresh` has
  // been set by Apostrophe's content refresh mechanism).

  self.isAjaxRequest = function(req) {
    return (req.xhr || req.query.xhr) && (!req.query.apos_refresh);
  };

  // Store a "blessing" in the session for the given set of arguments
  // (everything after `req`).
  //
  // Example:
  //
  // DURING PAGE RENDERING OR OTHER TRUSTED RENDERING OPERATION
  //
  // `apos.utils.bless(req, options, 'widget', widget.type)`
  //
  // ON A LATER AJAX REQUEST TO THE render-widget ROUTE
  //
  // `if (apos.utils.isBlessed(req, options, 'widget', widget.type)) { /* It's safe! */ }`
  //
  // This way we know this set of options was legitimately part of a recent page rendering
  // and therefore is safe to reuse to re-render a widget that is being edited.

  self.bless = function(req, options /* , arg2, arg3... */) {
    var hash = self.hashBlessing(Array.prototype.slice.call(arguments, 1));
    req.session.aposBlessings = req.session.aposBlessings || {};
    req.session.aposBlessings[hash] = true;
  };

  // See apos.utils.bless. Checks whether the given set of arguments
  // (everything after `req`) has been blessed in the current session.

  self.isBlessed = function(req, options /* , arg2, arg3... */) {
    var hash = self.hashBlessing(Array.prototype.slice.call(arguments, 1));
    return req.session.aposBlessings && _.has(req.session.aposBlessings, hash);
  };

  // See `self.bless` and `self.isBlessed`. Creates a unique hash for a given
  // set of arguments. Arguments must be JSON-friendly.

  self.hashBlessing = function(args) {
    var s = '';
    var i;
    for (i = 0; (i < args.length); i++) {
      s += JSON.stringify(args[i]);
    }
    return self.md5(s);
  };

  // Sort the given array of strings in place, comparing strings in a case-insensitive way.

  self.insensitiveSort = function(strings) {
    strings.sort(self.insensitiveSortCompare);
  };

  // Sort the given array of objects in place, based on the value of the given property of each object,
  // in a case-insensitive way.

  self.insensitiveSortByProperty = function(objects, property) {
    objects.sort(function(a, b) {
      return self.insensitiveSortCompare(a[property], b[property]);
    });
  };

  // Copmpare two strings in a case-insensitive way, returning -1, 0 or 1, suitable for use with sort().
  // If the two strings represent numbers, compare them as numbers for a natural sort order
  // when comparing strings like '4' and '10'.

  self.insensitiveSortCompare = function(a, b) {
    var na, nb;
    if (a && a.toString().toLowerCase()) {
      a = a.toString().toLowerCase();
    }
    if (b && b.toString().toLowerCase()) {
      b = b.toString().toLowerCase();
    }
    // Sort naturally when comparing two numbers,
    // so the relative order of 10 and 2 makes sense
    if (a.match(/^[\d.]+$/) && (b.match(/^[\d.]+/))) {
      na = parseFloat(a);
      nb = parseFloat(b);
      if (!(isNaN(na) || isNaN(nb))) {
        a = na;
        b = nb;
      }
    }
    if (a < b) {
      return -1;
    } else if (a > b) {
      return 1;
    } else {
      return 0;
    }
  };

  // Within the given object (typically a doc or widget),
  // find a subobject with the given `_id` property.
  // Can be nested at any depth.
  //
  // Useful to locate a specific widget within a doc.

  self.findNestedObjectById = function(object, id) {
    var key;
    var val;
    var result;
    for (key in object) {
      val = object[key];
      if (val && (typeof (val) === 'object')) {
        if (val._id === id) {
          return val;
        }
        result = self.findNestedObjectById(val, id);
        if (result) {
          return result;
        }
      }
    }
  };

  // Within the given object (typically a doc or widget),
  // find a subobject with the given `_id` property.
  // Can be nested at any depth.
  //
  // Useful to locate a specific widget within a doc.
  //
  // Returns an object like this: `{ object: { ... }, dotPath: 'dot.path.of.object' }`
  //
  // Ignore the `_dotPath` argument to this method; it is used for recursion.

  self.findNestedObjectAndDotPathById = function(object, id, _dotPath) {
    var key;
    var val;
    var result;
    var subPath;
    _dotPath = _dotPath || [];
    for (key in object) {
      val = object[key];
      if (val && (typeof (val) === 'object')) {
        subPath = _dotPath.concat(key);
        if (val._id === id) {
          return { object: val, dotPath: subPath.join('.') };
        }
        result = self.findNestedObjectAndDotPathById(val, id, subPath);
        if (result) {
          return result;
        }
      }
    }
  };

  self.enableLogger = function() {
    self.logger = self.options.logger ? self.options.logger(self.apos) : require('./logger.js')(self.apos);
  };

  // Log a message. The default
  // implementation wraps `console.log` and passes on
  // all arguments, so substitution strings may be used.
  //
  // Overrides should be written with support for
  // substitution strings in mind. See the
  // `console.log` documentation.
  //
  // If the logger has no `log` method, the `info` method
  // is used. This allows an instance of `bole` or similar
  // to be used directly.

  self.log = function(msg) {
    if (!self.logger.log) {
      return self.logger.info.apply(self.logger.info, arguments);
    }
    self.logger.log.apply(self.logger, arguments);
  };

  // Log an informational message. The default
  // implementation wraps `console.info` and passes on
  // all arguments, so substitution strings may be used.
  //
  // Overrides should be written with support for
  // substitution strings in mind. See the
  // `console.log` documentation.

  self.info = function(msg) {
    self.logger.info.apply(self.logger, arguments);
  };

  // Log a debug message. The default implementation wraps
  // `console.debug` if available, otherwise `console.log`,
  // and passes on all arguments, so substitution strings may be used.
  //
  // Overrides should be written with support for
  // substitution strings in mind. See the
  // `console.warn` documentation.

  self.debug = function(msg) {
    self.logger.debug.apply(self.logger, arguments);
  };

  // Log a warning. The default implementation wraps
  // `console.warn` and passes on all arguments,
  // so substitution strings may be used.
  //
  // Overrides should be written with support for
  // substitution strings in mind. See the
  // `console.warn` documentation.
  //
  // The intention is that `apos.utils.warn` should be
  // called for situations less dire than
  // `apos.utils.error`.

  self.warn = function(msg) {
    self.logger.warn.apply(self.logger, arguments);
  };

  // Log an error message. The default implementation
  // wraps `console.error` and passes on all arguments,
  // so substitution strings may be used.
  //
  // Overrides should be written with support for
  // substitution strings in mind. See the
  // `console.error` documentation.

  self.error = function(msg) {
    self.logger.error.apply(self.logger, arguments);
  };

};
