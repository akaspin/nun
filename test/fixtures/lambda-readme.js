exports.context = { 
    name: "John Dow",
    lambda: function() {
        
        return function(context, callback) {
            callback(undefined, function(data, context, callback) {
                setTimeout(function(){
                    callback(data.toUpperCase());
                }, 300);
            });
        };
    }
};

exports.options = {
        
};