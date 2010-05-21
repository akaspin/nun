var sys = require("sys");
var assert =  require('assert');
var fs = require("fs");
var path = require("path");
var Buffer = require('buffer').Buffer;

var nun = exports.nun = require("../");

file = exports.file = function(name) {
	return path.normalize(__dirname + "/fixtures/" + name + ".html");
};

assertFile = exports.assertFile = function(actual, name) {
	file = path.normalize(__dirname + "/expects/" + name + ".html");
	fs.readFile(file, 'binary', function(err, contents) {
		if (err) {
			throw err;
		} else {
			var buf = new Buffer(contents.length);
			buf.write(contents, 'binary', 0);
			var expected = buf.toString("utf8");
			
			//sys.debug(expected);
			assert.equal(actual, expected);
		}
	});
};

var ended = false;

exports.test = function(name, context, options, callback) {
	var fixture = {context: {}, options: {}};
	if (!context && !options) {
		fixture = require("./fixtures/" + name);
	}
	nun.render(file(name), fixture.context, fixture.options, 
			function(err, output){
		if (err) throw err;
		
		var buffer = ''; // all tests must produce data
		output
			.addListener('data', function(data){ buffer += data; })
			.addListener('end', function(){ 
				ended = true;
//				sys.debug("!" + buffer + "!");
				assertFile(buffer, name); 
			});
	});
};

process.addListener("exit", function () {
	  assert.ok(ended);
});

