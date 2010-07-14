exports.context = { 

};

exports.options = {
    filters: {
        upper: function(data, callback) {
            callback(undefined, data.toUpperCase());
        },
        wrap: function(data, callback) {
            callback(undefined, "<" + data + ">");
        }
    }    
};