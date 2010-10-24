var assert = require("assert");
var nun = require('../');

nun.render('notfound.html', {}, {}, function(err, tpl) {
    assert.ifError(!err);
});