var myVersion = "0.5.0", myProductName = "ioServer"; 

const fs = require ("fs");
const request = require ("request");
const davehttp = require ("davehttp"); 
const utils = require ("daveutils"); 

var config = {
	port: 1240,
	flLogToConsole: true,
	rootDomain: "instantoutliner.com",
	createPath: undefined, //the path you use to create a new short URL, must be specified in config.json
	urlOutlineTemplate: "http://scripting.com/code/ioreader/index.html",
	urlServerHomePageSource: "http://scripting.com/code/ioreader/homepage/index.html"
	};
const fnameConfig = "config.json";

var stats = {
	whenFirstStart: new Date (), 
	ctStarts: 0,
	whenLastStart: undefined,
	ctWrites: 0,
	
	ctHits: 0, 
	ctHitsToday: 0, 
	ctHitsThisRun:0, 
	whenLastHit: new Date (0),
	
	nextString: 0,
	outlineMap: {}
	};
const fnameStats = "stats.json";
var flStatsChanged = false;

function statsChanged () {
	flStatsChanged = true;
	}

function handleHttpRequest (theRequest) {
	var params = theRequest.params, now = new Date ();
	//stats
		if (!utils.sameDay (now, stats.whenLastHit)) { //day rollover
			stats.ctHitsToday = 0;
			}
		stats.ctHits++;
		stats.ctHitsToday++;
		stats.ctHitsThisRun++;
		stats.whenLastHit = now;
		statsChanged ();
	function returnHtml (htmltext) {
		theRequest.httpReturn (200, "text/html", htmltext);
		}
	function returnPlainText (s) {
		theRequest.httpReturn (200, "text/plain", s.toString ());
		}
	function return404 () {
		theRequest.httpReturn (404, "text/plain", "Not found.");
		}
	function returnData (jstruct) {
		if (jstruct === undefined) {
			jstruct = {};
			}
		theRequest.httpReturn (200, "application/json", utils.jsonStringify (jstruct));
		}
	function returnError (jstruct) {
		theRequest.httpReturn (500, "application/json", utils.jsonStringify (jstruct));
		}
	function httpReturn (err, jstruct) {
		if (err) {
			returnError (err);
			}
		else {
			returnData (jstruct);
			}
		}
	function returnUrlContents (url, pagetable, callback) {
		request (url, function (error, response, templatetext) {
			if (!error && response.statusCode == 200) {
				var pagetext = utils.multipleReplaceAll (templatetext, pagetable, false, "[%", "%]");
				returnHtml (pagetext);
				}
			});
		}
	function returnServerHomePage () {
		var pagetable = {
			rootDomain: config.rootDomain,
			version: myVersion
			};
		returnUrlContents (config.urlServerHomePageSource, pagetable);
		}
	function createOutlinePage (urlOpml, title, description, socketserver, callback) {
		function findInOutlineMap (longUrl, callback) {
			for (var x in stats.outlineMap) {
				var item = stats.outlineMap [x];
				if (item.url == longUrl) {
					callback (item, x);
					return;
					}
				}
			callback (undefined);
			}
		findInOutlineMap (urlOpml, function (item, key) {
			if (item !== undefined) {
				if (title !== undefined) {
					item.title = title;
					}
				if (description !== undefined) {
					item.description = description;
					}
				if (socketserver !== undefined) {
					item.socketserver = socketserver;
					}
				statsChanged ();
				callback (undefined, "http://" + config.rootDomain + "/" + key);
				}
			else {
				var thisString = stats.nextstring;
				var jstruct = {
					url: urlOpml,
					ct: 0,
					when: new Date (),
					title,
					description,
					socketserver
					};
				stats.outlineMap [thisString] = jstruct;
				stats.nextstring = utils.bumpUrlString (thisString);
				statsChanged ();
				callback (undefined, "http://" + config.rootDomain + "/" + thisString);
				}
			});
		}
	function returnOutlinePage (path, flReturnData) {
		var thisUrl = stats.outlineMap [utils.stringDelete (path, 1, 1)];
		if (thisUrl === undefined) {
			return404 ();
			}
		else {
			thisUrl.ct++;
			statsChanged ();
			if (flReturnData) {
				returnData (thisUrl);
				}
			else {
				returnUrlContents (config.urlOutlineTemplate, thisUrl);
				}
			}
		}
	switch (theRequest.lowerpath) {
		case "/":
			returnServerHomePage ();
			break;
		case "/version":
			returnPlainText (myVersion);    
			break;
		case "/now": 
			returnPlainText (now.toString ());    
			break;
		case "/status": 
			returnData (stats);
			break;
		case config.createPath:
			if (params.url === undefined) {
				callback ({message: "Can't create the short url because the \"url \"parameter is not provided."});
				}
			else {
				createOutlinePage (params.url, params.title, params.description, params.socketserver, httpReturn);
				}
			break;
		default:
			var fldata = (params.format === undefined) ? false : params.format == "data";
			returnOutlinePage (theRequest.path, fldata);
			break;
		}
	}

function readConfig (callback) {
	utils.sureFilePath (fnameConfig, function () {
		fs.readFile (fnameConfig, function (err, data) {
			if (!err) {
				try {
					var jstruct = JSON.parse (data.toString ());
					for (var x in jstruct) {
						config [x] = jstruct [x];
						}
					}
				catch (err) {
					console.log ("readConfig: err == " + err.message);
					}
				}
			if (callback !== undefined) {
				callback ();
				}
			});
		});
	}
function readStats (callback) {
	utils.sureFilePath (fnameStats, function () {
		fs.readFile (fnameStats, function (err, data) {
			if (!err) {
				try {
					var jstruct = JSON.parse (data.toString ());
					for (var x in jstruct) {
						stats [x] = jstruct [x];
						}
					}
				catch (err) {
					console.log ("readConfig: err == " + err.message);
					}
				}
			if (callback !== undefined) {
				callback ();
				}
			});
		});
	}
function everyMinute () {
	var now = new Date ();
	if (now.getMinutes () == 0) {
		console.log ("\n" + myProductName + ": " + now.toLocaleTimeString () + ", v" + myVersion + ", " + stats.ctHitsThisRun + " hits");
		}
	if (flStatsChanged) {
		flStatsChanged = false;
		stats.ctWrites++;
		fs.writeFile (fnameStats, utils.jsonStringify (stats), function (err) {
			});
		}
	}
function everySecond () {
	}

readStats (function () {
	stats.ctStarts++;
	stats.ctHitsThisRun = 0;
	stats.whenLastStart = new Date ();
	statsChanged ();
	readConfig (function () {
		console.log ("\n" + myProductName + " v" + myVersion + " running on port " + config.myPort + ".\n");
		console.log ("config == " + utils.jsonStringify (config));
		davehttp.start (config, handleHttpRequest);
		setInterval (everySecond, 1000); 
		setInterval (everyMinute, 60000); 
		});
	});
