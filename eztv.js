/**
 * EZTV plugin for M7 Media Center
 *
 *  Copyright (C) 2015-2024 Gekko, lprot, Wolfy, F0R3V3R50F7
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with this program. If not, see <http://www.gnu.org/licenses/>.
 */
var page = require('movian/page');
var service = require('movian/service');
var settings = require('movian/settings');
var tmdbApi = require('tmdb-api');
var popup = require('native/popup');
var eztvApi = require('eztv-api');
var plugin = JSON.parse(Plugin.manifest);
var logo = Plugin.path + "logo.png";

RichText = function (x) {
    this.str = x ? x.toString() : "";
}

RichText.prototype.toRichString = function (x) {
    return this.str;
}

var blue = '6699CC', orange = 'FFA500', red = 'EE0000', green = '008B45';

function coloredStr(str, color) {
    return '<font color="' + color + '">' + str + '</font>';
}

function setPageHeader(page, title) {
    page.loading = true;
    if (page.metadata) {
        page.metadata.title = title;
        page.metadata.logo = logo;
        page.metadata.background = Plugin.path + "bg.png"
    }
    page.type = "directory";
    page.contents = "items";
}

service.create(plugin.title, plugin.id + ":start", "video", true, logo);

settings.globalSettings(plugin.id, plugin.title, logo, plugin.synopsis);
settings.createBool('enableMetadata', 'Enable metadata fetching', true, function (v) {
    service.enableMetadata = v;
});

settings.createString('eztvBaseURL', "EZTV base URL without '/' at the end", 'https://eztv.wf', function (v) {
    service.eztvBaseUrl = v;
});

settings.createInt('minSeed', "Min seeds allowed", 15, 1, 100, 1,"seeds" , function (v) {
    service.minSeed = v;
});

settings.createString('tmdbBaseURL', "TMDB base URL without '/' at the end", 'https://api.themoviedb.org/3', function (v) {
    service.tmdbBaseUrl = v;
});

settings.createString('tmdbApiKey', "TMDB api key to display popular tv shows", 'a0d71cffe2d6693d462af9e4f336bc06', function (v) {
    service.tmdbApiKey = v;
});
settings.createBool('enableH265Filter', 'Filter H265 Content (For PS3)', false, function (v) {
    service.enableH265Filter = v;
});
settings.createBool('disableMyFavorites', 'Hide My Favorites', false, function(v) {
    service.disableMyFavorites = v;
  });

var store = require('movian/store').create('favorites');
if (!store.list) {
  store.list = '[]';
}

function addSelectedShowToFavorites(page, tmdbShow) {
    var tmdbId = tmdbShow.id; // Get TMDB ID
    var tmdbIcon = tmdbApi.retrievePoster(tmdbShow);
    var tmdbName = tmdbShow.name;

    var entry = JSON.stringify({
        tmdbId: tmdbId, // Store TMDB ID
        title: encodeURIComponent(tmdbName),
        icon: encodeURIComponent(tmdbIcon),
        link: encodeURIComponent(plugin.id + ':detail:' + tmdbId) // Store the correct URL
    });
    store.list = JSON.stringify([entry].concat(eval(store.list)));
    popup.notify('\'' + tmdbName + '\' has been added to My Favorites.', 3);
}

function removeSelectedShowFromFavorites(page, tmdbShow) {
    var tmdbId = tmdbShow.id; // Get TMDB ID

    var list = eval(store.list);
    var newList = list.filter(function(item) {
        var parsedItem = JSON.parse(item);
        return parsedItem.tmdbId !== tmdbId;
    });

    store.list = JSON.stringify(newList);
    popup.notify('\'' + tmdbShow.name + '\' has been removed from My Favorites.', 3);
    page.redirect(plugin.id + ':myfavs');
}

function bytesToSize(bytes) {
    var sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes == 0) return '0 Byte';
    var i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
    return Math.round(bytes / Math.pow(1024, i), 2) + ' ' + sizes[i];
}

function tmdbShowMetadata(show) {
    return {
        title:show.name,
        icon: tmdbApi.retrievePoster(show),
        vtype: 'tvseries',
        tagline: new RichText(show.overview)
    };
}

function tvShowList(page) {
    var fromPage = 1;
    var tryToSearch = true;
    page.entries = 0;

    function loader() {
        if (!tryToSearch) return false;
        var json = tmdbApi.retrievePopularShows(fromPage)
        page.loading = false;
        for (var i in json.results) {
            var show = json.results[i];
            var item = page.appendItem(plugin.id + ':detail:' + show.id, "directory", tmdbShowMetadata(show));
            page.entries++;
        }
        fromPage++;
        return true;
    }

    loader();
    page.paginator = loader;
    page.loading = false;
}

function browseItems(page, query) {
    var fromPage = 1;
    var tryToSearch = true;
    page.entries = 0;

    function loader() {
        if (!tryToSearch) return false;
        var json = eztvApi.retrieveAllTorrents(fromPage)
        page.loading = false;

        for (var i in json.torrents) {
            var torrent = json.torrents[i]
            var torrenUrlDecoded = escape(torrent.torrent_url)
            var itemUrl = plugin.id + ':play:' + torrenUrlDecoded + ':' + escape(torrent.title) + ':' + torrent.imdb_id + ':' + torrent.season + ':' + torrent.episode
            console.log("Item Url " + itemUrl)
            var item = page.appendItem(itemUrl, "video", {
                title: torrent.title,
                icon: torrent.small_screenshot ? 'https:' + torrent.small_screenshot : 'https://ezimg.ch/s/1/9/image-unavailable.jpg',
                vtype: 'tvseries',
                season: {number: +torrent.season},
                episode: {title: torrent.title, number: +torrent.episode},
                genre: new RichText(coloredStr('S: ', orange) + coloredStr(torrent.seeds, green) +
                    coloredStr(' P: ', orange) + coloredStr(torrent.peers, red) +
                    coloredStr(' Size: ', orange) + bytesToSize(torrent.size_bytes) +
                    (torrent.imdb_id ? coloredStr('<br>IMDb ID: ', orange) + 'tt' + torrent.imdb_id : '')),
                tagline: new RichText(coloredStr('Released: ', orange) + new Date(torrent.date_released_unix * 1000))
            });
            page.entries++;
            if (service.enableMetadata) {
                item.bindVideoMetadata({
                    imdb: 'tt' + torrent.imdb_id
                });
            }
        }
        fromPage++;
        return true;
    }

    loader();
    page.paginator = loader;
    page.loading = false;
}

function browseShowEpisodes(page, tmdbShow) {
    var imdbId = tmdbShow.external_ids.imdb_id;

    var fromPage = 1;
    var tryToSearch = true;
    page.entries = 0;

    var boxSetsAdded = false; // Flag to check if "Box Sets" separator is added

    function loader() {
        if (!tryToSearch) return false;
        var torrents = eztvApi.searchTorrentByImdbId(imdbId, fromPage, {resolutions: ["720","1080"], minSeeds: service.minSeed});
        page.loading = false;

        // Create a map to store seasons and episodes
        var seasons = {};

        for (var i in torrents) {
            var torrent = torrents[i];
            var torrenUrlDecoded = decodeURI(torrent.torrent_url);
            var episodeDetails = tmdbApi.retrieveEpisodeDetail(tmdbShow.id, torrent.season, torrent.episode);

            // Check if the season exists in the map, if not create it
            if (!seasons[torrent.season]) {
                seasons[torrent.season] = {};
            }

            // Check if the episode exists in the season, if not create it
            if (!seasons[torrent.season][torrent.episode]) {
                seasons[torrent.season][torrent.episode] = [];
            }

            // Filter out torrents containing 'x265', 'X265', 'H265', 'h265', 'h.265', 'x.265', 'X.265', 'H.265'
            if (service.enableH265Filter && /[xXhH]265/i.test(torrent.title)) {
                continue; // Skip this torrent
            }

            // Push the torrent into the correct episode
            seasons[torrent.season][torrent.episode].push(torrent);
        }

        // Now iterate over the seasons and episodes map and create the directories
        for (var season in seasons) {
            for (var episode in seasons[season]) {
                var episodeTitle = ""; // Initialize the episode title

                // Check if the torrent filename matches the Box Set pattern
                var isBoxSet = false;
                var boxSetRegex = /S\d{2}(?!E\d{2})/i;

                for (var i in seasons[season][episode]) {
                    if (boxSetRegex.test(seasons[season][episode][i].title)) {
                        isBoxSet = true;
                        break;
                    }
                }

                if (isBoxSet) {
                    // Add the "Box Sets" separator only once
                    if (!boxSetsAdded) {
                        page.appendItem(null, "separator", {
                            title: "Box Sets"
                        });
                        boxSetsAdded = true; // Set the flag to true
                    }
                } else {
                    // Retrieve TMDB episode title
                    if (episodeDetails && episodeDetails.name) {
                        episodeTitle = " | " + episodeDetails.name;
                    }

                    // Append TMDB episode title to the separator title
                    page.appendItem(null, "separator", {
                        title: "Season " + season + " | Episode " + episode + episodeTitle // Modified separator title
                    });
                }

                var torrents = seasons[season][episode];

                for (var i in torrents) {
                    var torrent = torrents[i];
                    var itemUrl;

                    if (isBoxSet) {
                        itemUrl = "torrent:browse:" + torrent.torrent_url;
                    } else {
                        itemUrl = plugin.id + ':play:' + torrenUrlDecoded + ':' + decodeURI(torrent.title) + ':' + torrent.imdb_id + ':' + torrent.season + ':' + torrent.episode;
                    }

                    var item = page.appendItem(itemUrl, "video", {
                        title: "Seeders: " + torrent.seeds + " | " + torrent.title, // Modified title to include seeder count
                        icon: tmdbApi.retrieveEpisodeScreenShot(episodeDetails, tmdbShow),
                        vtype: 'tvseries',
                        season: {number: +torrent.season},
                        episode: {title: torrent.title, number: +torrent.episode},
                        genre: new RichText(coloredStr('S: ', orange) + coloredStr(torrent.seeds, green) +
                            coloredStr(' P: ', orange) + coloredStr(torrent.peers, red) +
                            coloredStr(' Size: ', orange) + bytesToSize(torrent.size_bytes) +
                            (torrent.imdb_id ? coloredStr('<br>IMDb ID: ', orange) + 'tt' + torrent.imdb_id : '')),
                        tagline: new RichText(coloredStr('Released: ', orange) + new Date(torrent.date_released_unix * 1000)),
                        description: new RichText(episodeDetails.overview)
                    });

                    page.entries++;
                }
            }
        }

        fromPage++;
        return true;
    }

    loader();
    page.paginator = loader;
    page.loading = false;
}

function searchOnTmdb(page, query) {
    setPageHeader(page, plugin.title);
    page.entries = 0;
    var response = tmdbApi.searchShow(query);
    for (var i in response.results) {
        var show = response.results[i];
        var item = page.appendItem(plugin.id + ':detail:' + show.id, "directory", tmdbShowMetadata(show));
        page.entries++;
    }
    page.loading = false;
}

function search(page, query) {
    setPageHeader(page, plugin.title);
    page.entries = 0;
    var response = eztvApi.searchTorrentByQuery(query)
    // 1-link to the show, 2-show's title, 3-episode url, 4-episode's title, 5-magnet&torrent urls, 6-size, 7-released, 8-seeds
    var re = /<tr name="hover"[\s\S]*?<a href="([\s\S]*?)"[\s\S]*?alt="Info" title="([\s\S]*?)"[\s\S]*?<a href="([\s\S]*?)"[\s\S]*?class="epinfo">([\s\S]*?)<\/a>[\s\S]*?<td align="center"([\s\S]*?)<\/td>[\s\S]*?class="forum_thread_post">([\s\S]*?)<\/td>[\s\S]*?class="forum_thread_post">([\s\S]*?)<\/td>[\s\S]*?class="forum_thread_post">[\s\S]*?">([\s\S]*?)</g;
    var match = re.exec(response);

    while (match) {
        // 0 1    2   3
        // /shows/id/name-of-the-show
        var poster = match[1].split("/")
        var imageUrl = service.eztvBaseUrl + "/ezimg/thumbs/" + poster[3] + "-" + poster[2] + ".jpg"
        var re2 = /<a href="([\s\S]*?)"/g;
        var urls = re2.exec(match[5]);
        var lnk = '';
        while (urls) { // we prefer .torrent 
            lnk = urls[1];
            urls = re2.exec(match[5])
        }
        var item = page.appendItem('torrent:video:' + lnk, "video", {
            title: new RichText(match[4]),
            icon: imageUrl,
            genre: new RichText((match[8] ? coloredStr('Seeds: ', orange) + coloredStr(match[8], green) + ' ' : '') +
                coloredStr('Size: ', orange) + match[6]),
            tagline: new RichText(coloredStr('<br>Released: ', orange) + match[7])
        });
        page.entries++;
        match = re.exec(response);
    }
    page.loading = false;
}

new page.Route(plugin.id + ":start", function (page) {
    setPageHeader(page, plugin.synopsis);
    page.model.contents = 'grid';


    if (!service.disableMyFavorites) {
        page.appendItem('', 'separator', {
          title: 'My Favorites',
        });
        page.appendItem('', 'separator', {
          title: '',
        });
      
        if (!service.disableMyFavorites);
        var list = eval(store.list);
          var pos = 0;
          for (var i in list) {
            if (pos >= 4) break; // Stop after listing 4 items
            var itemmd = JSON.parse(list[i]);
            var item = page.appendItem(decodeURIComponent(itemmd.link), 'playable', {
              title: decodeURIComponent(itemmd.title),
              icon: itemmd.icon ? decodeURIComponent(itemmd.icon) : null,
              description: new RichText(coloredStr('Link: ', orange) + decodeURIComponent(itemmd.link)),
            });
            pos++;
          }
        }
      
        if (!service.disableMyFavorites) {
          var list = eval(store.list);
        
          if (!list || list.length === 0) {
            page.appendItem(plugin.id + ":start", "directory", {
              title: "Refresh",
              icon: 'https://i.postimg.cc/T1j3TpwG/refresh.png'
            });
          }
        }
      
        if (!service.disableMyFavorites) {
          var list = eval(store.list);
        
          if (!list || list.length === 1) {
            page.appendItem(plugin.id + ":start", "directory", {
              title: "Refresh",
              icon: 'https://i.postimg.cc/T1j3TpwG/refresh.png'
            });
          }
        }
      
        if (!service.disableMyFavorites) {
          var list = eval(store.list);
        
          if (!list || list.length === 2) {
            page.appendItem(plugin.id + ":start", "directory", {
              title: "Refresh",
              icon: 'https://i.postimg.cc/T1j3TpwG/refresh.png'
            });
          }
        }
      
        if (!service.disableMyFavorites) {
          var list = eval(store.list);
        
          if (!list || list.length === 3) {
            page.appendItem(plugin.id + ":start", "directory", {
              title: "Refresh",
              icon: 'https://i.postimg.cc/T1j3TpwG/refresh.png'
            });
          }
        }
      
        if (!service.disableMyFavorites) {
          var list = eval(store.list);
      
            if (list && list.length > 0) {
              page.appendItem(plugin.id + ":myfavs", "directory", {
                title: "Show All...",
                icon: 'https://i.postimg.cc/zGT28Cz2/favs.png'
            });
          }
        }
    
    page.appendItem('', 'separator', { title: '' });
    page.appendItem('', 'separator', { title: 'Discover Shows' }); 

    page.appendItem('', 'separator', { title: '' });
    page.appendItem(plugin.id + ":search:", 'search', {
        title: 'Search for Shows '
    });

    page.appendItem('', 'separator', { title: '' });
    tvShowList(page);
    page.loading = false;
});

new page.Route(plugin.id + ":play:(.*):(.*):(.*):(.*):(.*)", function (page, url, title, imdb_id, season, episode) {
    page.loading = true;
    page.type = 'video';
    page.source = "videoparams:" + JSON.stringify({
        title: unescape(title),
        canonicalUrl: plugin.id + ':play:' + url + ':' + title + ':' + imdb_id + ':' + season + ':' + episode,
        sources: [{
            url: 'torrent:video:' + unescape(url)
        }],
        imdbid: imdb_id ? 'tt' + imdb_id : 0,
        season: season,
        episode: episode,
        no_fs_scan: true
    });
    page.loading = false;
});

new page.Route(plugin.id + ":detail:(.*)", function(page, id) {
    var tmdbShow = tmdbApi.retrieveShowById(id);

    setPageHeader(page, tmdbShow.name);
    
    page.options.createAction('addShowToFavorites', 'Save this show to My Favorites', function() {
        addSelectedShowToFavorites(page, tmdbShow);
    });

    page.options.createAction('removeShowFromFavorites', 'Remove this show from My Favorites', function() {
        removeSelectedShowFromFavorites(page, tmdbShow);
    });

    var showExistOnEZTV = false;
    var imdbId = tmdbShow.external_ids.imdb_id;
    if (imdbId) {
        showExistOnEZTV = eztvApi.showExists(imdbId);
    }

    if (imdbId && showExistOnEZTV) {
        browseShowEpisodes(page, tmdbShow);
    } else {
        page.appendItem("", "separator", {
            title: new RichText(coloredStr('No results', 'FFA500', "+2"))
        });
        page.loading = false;
    }

});

new page.Route(plugin.id + ":search:(.*)", function (page, query) {
    searchOnTmdb(page, query);
});

page.Searcher(plugin.id, logo, function (page, query) {
    searchOnTmdb(page, query);
});

//My Favourites Page
new page.Route(plugin.id + ':myfavs', function(page) {
    page.metadata.icon = 'https://i.postimg.cc/zGT28Cz2/favs.png';
    setPageHeader(page, "My Favorites");
    page.model.contents = 'grid';
    popup.notify("Empty My Favorites in the Side-Menu", 7);

    page.options.createAction('cleanFavorites', 'Empty My Favorites', function() {
        store.list = '[]';
        popup.notify('Favorites has been emptied successfully', 3);
        page.redirect(plugin.id + ':start');
    });

    var list = eval(store.list);
    for (var i in list) {
        var itemmd = JSON.parse(list[i]);
        // Construct the URL using TMDB ID
        var itemUrl = decodeURIComponent(itemmd.link); // Decode the URL for the detail route
        var item = page.appendItem(itemUrl, "directory", {
            title: decodeURIComponent(itemmd.title),
            icon: itemmd.icon ? decodeURIComponent(itemmd.icon) : null,
            description: new RichText(coloredStr('Link: ', orange) + decodeURIComponent(itemUrl)),
        });
    }
page.loading = false;
});