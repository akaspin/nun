var sys = require("sys");
var assert =  require('assert');
var HStream = require("../hstream").HStream;

var lambda = function(data, callback) {
	setTimeout(function() {
		callback("[" + data + "]");
	},300);
};

var buffer = '';
var expect = '<1>:[<1/1><1/2/1><1/2/2>]:<2>:[<3>]:<4>:';
var ended = false;

var hs = new HStream();
hs
.addListener('data', function(data) {
	buffer += data + ":";
})
.addListener('end', function() {
	ended = true;
	assert.equal(buffer, expect);
});

hs.map('0');  
hs.map('1');  
hs.map('2');
hs.map('3');
hs.map('4');
hs.write('2', '<2>');  
hs.end('');  

hs.map('1/1');  
hs.map('1/2');  
hs.end('1');

hs.map('1/2/1');
hs.map('1/2/2');
hs.end('1/2');

hs.lambda('1', lambda); // lambda to substructure
hs.lambda('3', lambda); // lambda to single chunk

hs.write('1/2/1', '<1/2/1>');
hs.write('1/2/2', '<1/2/2>');

hs.write('0', '<1>');
hs.write('3', '<3>');
hs.write('4', '<4>');
hs.write('1/1', '<1/1>');

process.addListener("exit", function () {
	  assert.ok(ended);
});