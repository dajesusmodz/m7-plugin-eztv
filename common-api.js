var page = require('movian/page');
var http = require('movian/http');

exports.callService = function (url) {
    page.loading = true;
    var response = http.request(url).toString();
    page.loading = false;
    return response
}