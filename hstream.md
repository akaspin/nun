# HStream

Implementation of hierarchial mapped stream.

## Usage

Unlike standart stream, HStream writed to handle hierarchial structures that
creates in async manner. So. Following code...

    var sys = require("sys");
    var hs = require("hstream").HStream;

    var lambda = function(data, callback) {
        setTimeout(function() {
            callback("[" + data + "]");
        },300);
    };
    
    var hs = new HStream();
    var buffer = '';
    var hs = new HStream()
        .addListener('data', function(data) {
            buffer += data + ":";
        })
        .addListener('end', function() {
            sys.puts(buffer);
        });
    
    hs.map("0"); hs.map('0');  
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
    
... will produce this output:

    <1>:[<1/1><1/2/1><1/2/2>]:<2>:[<3>]:<4>:
    
As we see, data emits as soon as possible.

