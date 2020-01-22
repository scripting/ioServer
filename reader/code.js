var appConsts = {
	productname: "ioWatcher",
	productnameForDisplay: "Instant Outline watch",
	urlChatLogSocket: "ws://storage.littleoutliner.com:1242/"
	};
var appPrefs = {
	outlineFontSize: 16,
	outlineLineHeight: 24,
	flLocked: true
	};
var myChatLogSocket;
var flUpdateWaiting = false, lastOpmltext = undefined;
const dateFormatString = "%A, %B %e, %Y at %l:%M %p";

function updateHeaderElements () {
	var headers = opGetHeaders ();
	function formatDateTime (d) {
		d = new Date (d);
		return (d.toLocaleDateString () + "; " + d.toLocaleTimeString ());
		}
	console.log ("updateHeaderElements: title == " + opGetTitle ());
	console.log ("updateHeaderElements: headers == " + jsonStringify (headers));
	var whenModified = formatDateTime (headers.dateModified); //1/17/20 by DW
	
	var theDescription = headers.description;
	if (theDescription === undefined) {
		theDescription = "";
		}
	
	var theTitle = trimWhitespace (headers.longTitle);
	if (theTitle.length == 0) {
		theTitle = trimWhitespace (opGetTitle ());
		}
	if (theTitle.length == 0) {
		theTitle = "&nbsp;";
		}
	
	$("#idTitle").html ("<a href=\"#\" data-toggle=\"tooltip\" data-placement=\"bottom\" title=\"" + headers.description + "\">" + theTitle + "</a>");
	$("#idByLine").html ("<a href=\"" + headers.ownerId + "\" target=\"_blank\">" + headers.ownerName + "</a>; " + whenModified + ".");
	
	var pageTitle = headers.longTitle;
	if (pageTitle === undefined) {
		pageTitle = trimWhitespace (opGetTitle ());
		}
	if (pageTitle.length == 0) {
		pageTitle = appConsts.productnameForDisplay;
		}
	document.title = pageTitle; //6/25/16 by DW
	
	$('[data-toggle="tooltip"]').tooltip(); 
	}
function updateLockedIcon () {
	var iconname = (appPrefs.flLocked) ? "lock" : "unlock";
	var waitingstyle = " style='color: green;'";
	var style = (flUpdateWaiting) ? waitingstyle : "";
	var tip = (appPrefs.flLocked) ? "Unlock to allow updates." : "Lock the outline while you're reading.";
	$("#idLockIcon").html ("<i class=\"fa fa-" + iconname + "\"" + style + "></i>");
	$("#idLinkToLockIcon").attr ("title", tip);
	}
function toggleLocked () {
	appPrefs.flLocked = !appPrefs.flLocked;
	if ((!appPrefs.flLocked) && flUpdateWaiting) {
		receivedUpdate (lastOpmltext);
		flUpdateWaiting = false;
		}
	updateLockedIcon ();
	}
function receivedUpdate (opmltext) {
	if (appPrefs.flLocked) {
		lastOpmltext = opmltext;
		flUpdateWaiting = true;
		updateLockedIcon ();
		}
	else {
		opInitOutliner (opmltext, true);
		updateHeaderElements ();
		}
	}
function wsWatchForChange (urlToWatch, callback) {
	if (myChatLogSocket === undefined) {
		myChatLogSocket = new WebSocket (appConsts.urlChatLogSocket); 
		myChatLogSocket.onopen = function (evt) {
			var msg = "watch " + urlToWatch;
			console.log ("sending: \"" + msg + "\"");
			myChatLogSocket.send (msg);
			};
		myChatLogSocket.onmessage = function (evt) {
			var s = evt.data;
			if (s !== undefined) { //no error
				var updatekey = "update\r";
				if (beginsWith (s, updatekey)) { //it's an update
					s = stringDelete (s, 1, updatekey.length);
					callback (s);
					}
				}
			};
		myChatLogSocket.onclose = function (evt) {
			console.log ("myChatLogSocket was closed.");
			myChatLogSocket = undefined;
			};
		myChatLogSocket.onerror = function (evt) {
			console.log ("myChatLogSocket received an error");
			};
		}
	}
function everySecond () {
	wsWatchForChange (theOutline.url, function (opmltext) {
		console.log ("everySecond: websocket returned with opmltext.length == " + opmltext.length);
		receivedUpdate (opmltext);
		});
	}
function startup () {
	console.log ("startup");
	readHttpFile (theOutline.url, function (opmltext) {
		opInitOutliner (opmltext, true);
		opVisitAll (function (headline) {
			var s = headline.getLineText ();
			s = trimWhitespace (s);
			if (beginsWith (s, "http://") || beginsWith (s, "https://")) {
				console.log (s);
				headline.setLineText ("<a href=\"" + s + "\">" + s + "</a>");
				}
			});
		updateHeaderElements ();
		updateLockedIcon ();
		self.setInterval (everySecond, 1000); 
		});
	}
