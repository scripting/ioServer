var myVersion = "0.6.0", myProductName = "ioServer"; 

const fs = require ("fs");
const request = require ("request");
const utils = require ("daveutils"); 
const opmlToJs = require ("opmltojs");
const davehttp = require ("davehttp"); 
const davesql = require ("davesql");

var config = {
	port: 1240,
	flLogToConsole: true,
	flAllowAccessFromAnywhere: true, 
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
	
	nextstring: "0"
	};
const fnameStats = "stats.json";
var flStatsChanged = false;

var outlineMap = new Object ();  //10/1/20 by DW -- pulled out of stats
const fnameOutlinemap = "map.json";
var flOutlineMapChanged = false;


function populateDatabase () { //6/25/21 by DW
	let ctlinks = 0;
	for (var x in outlineMap) {
		let item = outlineMap [x];
		let theLink = {
			id: x,
			url: item.url,
			ct: item.ct,
			whenCreated: new Date (item.when),
			title: item.title,
			socketserver: item.socketserver,
			description: item.description
			}
		let sqltext = "replace into links " + davesql.encodeValues (theLink);
		davesql.queueQuery (sqltext, function (err, result) {
			if (err) {
				console.log (err.message);
				}
			else {
				console.log (ctlinks++ + ": " + utils.jsonStringify (theLink));
				}
			});
		}
	}
function findLinkInDatabase (theLink, callback) { //6/25/21 by DW
	var sqltext = "select * from links where url = " + davesql.encode (theLink) + ";";
	davesql.runSqltext (sqltext, function (err, result) {
		if (err) {
			callback (err);
			}
		else {
			if (result.length == 0) {
				callback (undefined, undefined);
				}
			else {
				callback (undefined, result [0]);
				}
			}
		});
	}
function findInDatabase (id, callback) {
	var sqltext = "select * from links where id = " + davesql.encode (id) + ";";
	davesql.runSqltext (sqltext, function (err, result) {
		if (err) {
			callback (err);
			}
		else {
			if (result.length == 0) {
				callback (undefined, undefined);
				}
			else {
				callback (undefined, result [0]);
				}
			}
		});
	}
function addLinkToDatabase (theLink, callback) { //6/25/21 by DW
	let sqltext = "replace into links " + davesql.encodeValues (theLink);
	davesql.runSqltext (sqltext, callback);
	}

function statsChanged () {
	flStatsChanged = true;
	}
function outlinemapChanged () {
	flOutlineMapChanged = true;
	}
function findSubOutline (theOutline, permalink) {
	var theSub = undefined;
	function lookin (subs) {
		subs.forEach (function (sub) {
			if (theSub === undefined) {
				if (utils.getPermalinkString (sub.created) == permalink) {
					theSub = sub;
					return;
					}
				else {
					if (sub.subs !== undefined) {
						lookin (sub.subs)
						}
					}
				}
			});
		}
	lookin (theOutline.opml.body.subs);
	return (theSub);
	}
function getSubOutline (urlOpml, permalink, callback) {
	request (urlOpml, function (err, response, opmltext) {
		if (err) {
			callback (err);
			}
		else {
			if (response.statusCode != 200) {
				callback ({message: "Error reading the OPML file, code == " + response.statusCode + "."});
				}
			else {
				opmlToJs.parse (opmltext, function (theOutline) {
					if (err) {
						callback (err);
						}
					else {
						var theSubOutline = findSubOutline (theOutline, permalink);
						if (theSubOutline === undefined) {
							var err = {
								message: "Can't find the suboutline because there is no item with the permalink provided."
								};
							callback (err);
							}
						else {
							theOutline.opml.body.subs = [
								theSubOutline
								];
							theOutline.opml.head.title = theSubOutline.text;
							theOutline.opml.head.expansionState = 1;
							theOutline.opml.head.lastCursor = 0;
							theOutline.opml.head.generator = myProductName + " v" + myVersion;
							var opmltext = opmlToJs.opmlify (theOutline);
							callback (undefined, opmltext);
							}
						}
					});
				}
			}
		});
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
	function returnRedirect (url, code) { //9/30/20 by DW
		var headers = {
			location: url
			};
		if (code === undefined) {
			code = 302;
			}
		theRequest.httpReturn (code, "text/plain", code + " REDIRECT", headers);
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
	function httpReturnString (err, s) {
		if (err) {
			returnError (err);
			}
		else {
			returnPlainText (s);
			}
		}
	function httpReturnOpmlText (err, opmltext) {
		if (err) {
			returnError (err);
			}
		else {
			theRequest.httpReturn (200, "text/xml", opmltext.toString ());
			}
		}
	function returnUrlContents (urlTemplate, pagetable, callback) {
		request (urlTemplate, function (error, response, templatetext) {
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
		findLinkInDatabase (urlOpml, function (err, item) {
			if (err) {
				callback (err.message); 
				}
			else {
				if (item === undefined) { //it's a new link
					item = {
						id: stats.nextstring,
						url: urlOpml,
						ct: 0,
						whenCreated: new Date (),
						title,
						description,
						socketserver
						};
					stats.nextstring = utils.bumpUrlString (stats.nextstring);
					statsChanged ();
					}
				else {
					if (title !== undefined) {
						item.title = title;
						}
					if (description !== undefined) {
						item.description = description;
						}
					if (socketserver !== undefined) {
						item.socketserver = socketserver;
						}
					}
				addLinkToDatabase (item);
				callback (undefined, "http://" + config.rootDomain + "/" + item.id);
				}
			});
		}
	function returnOutlinePage (id, permalink, flReturnData) {
		id = utils.stringDelete (id, 1, 1); //drop the / at the beginning
		findInDatabase (id, function (err, item) {
			if (err || (item == undefined)) {
				return404 ();
				}
			else {
				if (flReturnData) {
					returnData (item);
					}
				else {
					returnRedirect ("http://littleoutliner.com?url=http://instantoutliner.com/" + id); //9/30/20 by DW
					}
				item.ct++;
				addLinkToDatabase (item);
				}
			});
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
		case "/getsuboutline":
			getSubOutline (params.url, params.permalink, httpReturnOpmlText);
			break;
		case config.createPath:
			if (params.url === undefined) {
				returnError ({message: "Can't create the short url because the \"url\" parameter is not specified."});
				}
			else {
				createOutlinePage (params.url, params.title, params.description, params.socketserver, httpReturnString);
				}
			break;
		default:
			var fldata = (params.format === undefined) ? false : params.format == "data";
			returnOutlinePage (theRequest.path, params.permalink, fldata);
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
function readOutlinemap (callback) {
	utils.sureFilePath (fnameOutlinemap, function () {
		fs.readFile (fnameOutlinemap, function (err, data) {
			if (!err) {
				try {
					outlineMap = JSON.parse (data.toString ());
					}
				catch (err) {
					console.log ("readOutlinemap: err == " + err.message);
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
	}
function everySecond () {
	if (flStatsChanged) {
		flStatsChanged = false;
		stats.ctWrites++;
		fs.writeFile (fnameStats, utils.jsonStringify (stats), function (err) {
			});
		}
	if (flOutlineMapChanged) {
		flOutlineMapChanged = false;
		fs.writeFile (fnameOutlinemap, utils.jsonStringify (outlineMap), function (err) {
			});
		}
	}

readOutlinemap (function () {
	readStats (function () {
		stats.ctStarts++;
		stats.ctHitsThisRun = 0;
		stats.whenLastStart = new Date ();
		statsChanged ();
		readConfig (function () {
			console.log ("\n" + myProductName + " v" + myVersion + " running on port " + config.port + ".\n");
			davesql.start (config.database, function () { //6/25/21 by DW
				davehttp.start (config, handleHttpRequest);
				setInterval (everySecond, 1000); 
				setInterval (everyMinute, 60000); 
				});
			});
		});
	});
