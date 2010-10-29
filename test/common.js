var fs = require("fs");
var path = require("path");
var assert = require("assert");
var pit = require("./run.js");

var nun = exports.nun = require("../");

pit.expect("ended", 1);

exports.test = function(name, context, options, callback) {
        
    function file(name) {
        return path.normalize(__dirname + "/fixtures/" + name + ".html");
    };
    
    function assertFile(actual, name) {
        file = path.normalize(__dirname + "/expects/" + name + ".html");
        fs.readFile(file, 'utf8', function(err, expected) {
            if (err) {
                throw err;
            } 
            assert.equal(actual, expected);
        });
    };
    
    var fixture = {context: {}, options: {}};
    if (!context || !options) {
        overFixture = require("./fixtures/" + name);
    }
    fixture.context = context ? context : overFixture.context;
    fixture.options = options ? options : overFixture.options;

    nun.render(file(name), fixture.context, fixture.options, 
            function(err, output){
        if (err) throw err;
        
        var buffer = ''; // all tests must produce data
        output
            .addListener('data', function(data){ buffer += data; })
            .addListener('end', function(){ 
                pit.mark("ended");
                assertFile(buffer, name);
            });
    });
};
