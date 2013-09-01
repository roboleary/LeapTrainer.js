/*!
 * The MIT License (MIT)
 * 
 * Copyright (c) 2013 Robert O'Leary
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

jQuery(document).ready(function ($) {

	/*
	 * First we create the leap controller - since the training UI will respond to event coming directly from the device.
	 */
	var controller = new Leap.Controller();

	/*
	 * Now we create the trainer controller, passing the leap controller as a parameter
	 */
	var trainer = new LeapTrainer.Controller({controller: controller});

	/*
	 * We get the DOM crawling done now during setup, so it's not consuming cycles at runtime.
	 */
	var body				= $("body");
	
	var gesturesArea 		= $('#gestures-area');
	var creationForm		= $('#new-gesture-form');
	var existingGestures 	= $('#existing-gestures');
	var existingGestureList = $("#existing-gesture-list");
	var newGestureName		= $('#new-gesture-name');
	
	var output				= $("#output");
	var outputArea 			= $('#output-area');
	var outputText 			= $('#output-text');

	var h1 					= $('h1');
	var h2 					= $('h2');
	var h3 					= $('h3');	

	var chartArea 			= $('#chart-area');
	var chart 				= new Chart(chartArea[0].getContext('2d'));

	var overlayArea			= $('#overlay');
	var overlayShade		= $('#overlay-shade');
    var exportingName		= $('#exporting-gesture-name');
	var exportingSampleText = $('#exporting-gesture-sample-text');
    var exportText 			= $('#export-text');
    var closeOverlayButton 	= $('#close-overlay');

	/*
	 * We set up some colours for the output ring and the motion graph
	 */
	var white				= '#FFFFFF';
	var red					= '#EE5A40';
	var green				= '#9BEC42';
	var yellow				= '#EDE941';
	var grey				= '#CCCCCC';
	
	var chartBlue			= 'rgba(135, 206, 235, 0.5)';

	var chartFill			= chartBlue; 
	var chartStroke			= white; 
	var chartPoint			= chartBlue; 
	var chartPointStroke	= white;
	var scaleLineColor		= white;

	var scaleGridLineColor  = grey;

	var datasetStrokeWidth	= 1.0;
	var scaleLineWidth		= 1.0;
	var scaleGridLineWidth	= 0.25;

	var scaleFontColor		= '#333';
	var scaleFontFamily		= 'Calibri';
	var scaleFontStyle		= 'bold';
	
	/*
	 * Some constants
	 */
	var RECOGNIZED 			= 'Recognized!';
	var RECORDING 			= 'Recording';
	var EXPORT 				= 'Export';

	/*
	 * And we declare some working variables for use below
	 */
	var windowHeight,
		gesturesAreaWidth,
		outputDiameter, 
		ring = null, 
		ringArea = null, 
		outputWidth, 
		h1Size, 
		h2Size, 
		h3Size,
		labels = [], 
		datasets = [], 
		frames, 
		data;
	
	/*
	 * The gesture list has a fancy-pants flat scrollbar, which is initialized here.
	 */
	existingGestures.perfectScrollbar({wheelSpeed:30, minScrollbarLength: 10});	

	/*
	 * The options menu is bound to the options button
	 */
    $('#options-button').sidr({ name: 'options', source: '#options', side: 'right' });
   
	/*
	 * And options menu opening and closing is also bound left and right swipes on touchscreens
	 */
    function openOptions ()  { $.sidr('open', 'options'); }
    function closeOptions () { $.sidr('close', 'options'); }
    
    $(window).touchwipe({
    	wipeRight				: closeOptions,
        wipeLeft				: openOptions,
        preventDefaultEvents	: false
    });

    /*
     * Now we set the listeners for updating all options.  
     * 
     * Sidr will have blown out all existing handles and changed all the element IDs.
     */
	var recordingTriggers 		= $('#sidr-id-recording-triggers');
	var recordingStrategies 	= $('#sidr-id-recording-strategies');
	var recogStrategies 		= $('#sidr-id-recognition-strategies');
	
    /*
     * The option inputs are populated with the available trainer implementations and event listeners bound to them
     */
	var updateConfirmation  = $('#sidr-id-options-update-confirmation');
	
	function optionsUpdated() { updateConfirmation.show(); setTimeout(function() { updateConfirmation.hide(); }, 3000); }
	
	var impl, t = [], s = [], cs = [];
	
	/*
	 * This function adds an option to a select list
	 */
    function setupOptionList(rt, t, list, implName) {

    	if (rt) { rt = rt(); if (t.indexOf(rt) == -1) { t.push(rt); list.append('<option value="' + implName + '">' + rt + '</option>'); }}
    }
    
    /*
     * We populate the recording triggers, recording strategies, and recognition strategies option lists.
     */
    for (var implName in LeapTrainer) {

    	impl = LeapTrainer[implName].prototype;
    	
    	setupOptionList(impl.getRecordingTriggerStrategy, t, recordingTriggers, implName);
    	setupOptionList(impl.getFrameRecordingStrategy, s, recordingStrategies, implName);
    	setupOptionList(impl.getRecognitionStrategy, cs, recogStrategies, implName);
    }
    
    /*
     * This function merges a function from one controller class into another
     */
    function modifyController(replacementController) {
    	
    	replacementController = LeapTrainer[replacementController];
    	
    	var fields = replacementController.overidden;

    	var func;
    	
    	for (var field in fields) {

    		func = replacementController.prototype[field];
    		
    		if (func.bind) { func.bind(trainer); }
    		
    		trainer[field] 	= func;
    	}

    	optionsUpdated();
    }
    
    /*
     * TODO: This is AWFUL.. The functions involved in each strategy are assumed to be ALL overridden functions in the controller.. This may 
     * not be the case.  
     * 
     * This really needs to be swapped out for something more reliable!
     */
	recordingTriggers.change(function() 	{ modifyController(recordingTriggers.val()); });
	recordingStrategies.change(function() 	{ modifyController(recordingStrategies.val()); });
	recogStrategies.change(function() 		{ modifyController(recogStrategies.val()); });

	
	

	/*
	 * This function updates a variable in the controller with a new value from one of the option input boxes.
	 * 
	 * TODO: Some input validation would be useful here.
	 */
    function setupOptionInput(binding) {
    	
    	var input 	= $('#sidr-id-' + binding);
    	
    	input.val(trainer[binding]);
    	
    	input.blur(function() {
    		
    		var val = input.val();
    		
    		if (val != trainer[binding]) { trainer[binding] = val; optionsUpdated(); }
    	});
    }
    
    setupOptionInput('minRecordingVelocity');
    setupOptionInput('minGestureFrames');
    setupOptionInput('hitThreshold');
    setupOptionInput('trainingGestures');
    setupOptionInput('convolutionFactor');
    setupOptionInput('downtime');

    /*
     * Prepare the export overlay
     */
    closeOverlayButton.click(closeExportOverlay);

    overlayShade.on('click', function (e) { if (body.hasClass('overlay-open')) { closeExportOverlay(); } });

    $(document).on('keydown', function (e) { if (e.keyCode === 27 ) { closeExportOverlay(); }});
    
    exportText.click(function() { this.focus(); this.select(); });

	/**
	 * 
	 */
	function openExportOverlay(listItem, gestureName) {

	    listItem.addClass('selected');

	    exportingName.html(gestureName);
	    
	    var json = trainer.toJSON(gestureName);
	    
	    exportingSampleText.html((json.length > 60 ? json.substring(0, 60) : json) + '...');

	    exportText.html(json);
	    
	    body.addClass('overlay-open');

	    exportText.css({height: overlayArea.height() - (overlayArea.children()[0].clientHeight + 150)});
	};
	
	/**
	 * 
	 */
	function closeExportOverlay() {
		
		existingGestureList.find('li').removeClass('selected');

		body.removeClass('overlay-open');
	};
	
    /*
     * Now we set up the interface configuration drop-downs, which can be used to bind gestures to interface operations
     */
	var openConfiguration 	= $('#sidr-id-open-configuration');
    var closeConfiguration 	= $('#sidr-id-close-configuration');
    var exportCloseOverlay 	= $('#sidr-id-close-export-overlay');

    var openConfigGesture = null, closeConfigGesture = null, closeExportGesture = null;
    
    function registerUIGesture (oldGesture, newGesture, func) { trainer.off(oldGesture, func); trainer.on(newGesture, func); optionsUpdated(); return newGesture; }

	openConfiguration.change(function()  { openConfigGesture  = registerUIGesture(openConfigGesture, openConfiguration.val(), openOptions); });
	closeConfiguration.change(function() { closeConfigGesture = registerUIGesture(closeConfigGesture, closeConfiguration.val(), closeOptions); });
	exportCloseOverlay.change(function() { closeExportGesture = registerUIGesture(closeExportGesture, exportCloseOverlay.val(), closeExportOverlay); });

	

    /*
	 * When the window resizes we refresh the output ring, changing its size and the size of the output text.
	 */
	function updateDimensions() {

		windowHeight 	= $(window).innerHeight();

		gesturesArea.css({height: windowHeight});
		overlayShade.css({height: windowHeight});
		
		gesturesAreaWidth = gesturesArea.width();
		
		chartArea.css({width: gesturesAreaWidth * 0.88, height: gesturesAreaWidth * 0.6, bottom: gesturesAreaWidth * 0.04, left: gesturesAreaWidth * 0.04 });
		
		existingGestures.css({height: windowHeight - chartArea.height() - 170}); 

		outputWidth = ($(window).innerWidth() - gesturesAreaWidth - 1);

		outputArea.css({width: outputWidth});
		
		h1Size = Math.max(outputWidth/15, 16);
		h2Size = Math.max(outputWidth/50, 13);
		h3Size = Math.max(outputWidth/55, 12);
		
		h1.css({fontSize: h1Size});
		h2.css({fontSize: h2Size});
		h3.css({fontSize: h3Size});				

		outputText.css({top: (windowHeight/2.2) - outputText.height()/2});

		outputDiameter = outputWidth/1.6;

		if (!ring) {
			
			ring = output.knob({ height: outputDiameter, width: outputDiameter, min: 0, max: 100, readOnly: true, inline: false, displayInput: false, fgColor: green, thickness: 0.15 });

			ringArea = $($(outputArea.children()[0]).children()[0]);

			ringArea.css({position: 'absolute'});
			
		} else {

			output.trigger('configure', {height: outputDiameter, width: outputDiameter });
		}
		
		ringArea.css({top: (windowHeight - outputDiameter)/2, left: (outputWidth - outputDiameter)/2});
		
		/*
		 * 
		 */
		overlayArea.css({left: gesturesAreaWidth + ((outputWidth * 0.3)/2), width: outputWidth * 0.7, height: windowHeight * 0.9});

		exportText.css({height: overlayArea.height() - (overlayArea.children()[0].clientHeight + 150)});
	}			
	
	/*
	 * We fire the dimensions update once to setup the correct inital dimensions.
	 */
	updateDimensions();

	/*
	 * And then bind the update function to window resize events.
	 */
	$(window).resize(updateDimensions);	

	/*
	 * The gestures area is hidden by default in order to avoid a visible but partially initialized screen on slow connections - so 
	 * it's set back to display here since initialization is complete.
	 */
	gesturesArea.show();
	
	/*
	 * The gesture name input should be cleared on focus and reset to the default if it's empty on blur.
	 * 
	 * So we set the default as a data attribute on the element
	 */
	newGestureName.data('default-text', newGestureName.val());

	/*
	 * And then bind focus and blur listeners
	 */
	newGestureName.focus(function() {

	    if ($(this).val() != '' && $(this).val() == $(this).data('default-text')) $(this).val("");
	
	}).blur(function(){ if ($(this).val() == "") $(this).val($(this).data('default-text')); });			
	
	/*
	 * The gesture creation form should fire a script when submit, rather than actually submit to a URL - so we bind a 
	 * function to the submit event which returns false in order to prevent the event propagating.
	 */
	creationForm.submit(function() { 

		var name = newGestureName.val().trim();

		/*
		 * If the input name is empty, the default on the box, or already exists in the list of existing gestures, we just do nothing and return.
		 * 
		 * TODO: Some sort of feedback on what happened here would be nice.
		 */
		if (name.length == 0 || name == newGestureName.data("default-text") || trainer.gestures[name] != null) { return false; }

		/*
		 * And then we create the new gesture in the trainer and return false to prevent the form submission event propagating
		 */
		trainer.create(name);
		
		return false; 
	});

	/*
	 * Next we need to set the listeners on the gesture trainer for updating the interface.  First though, we 
	 * create a utility function for updating the three title output text areas.
	 */
	function setOutputText(h1Text, h2Text, h3Text) {

		h1.html(h1Text ? h1Text : '&nbsp;');		
		h3.html(h2Text ? h2Text : '&nbsp;');
		h2.html(h3Text ? h3Text : '&nbsp;');
	};

	/*
	 * When a new gesture is created by the trainer, an entry is added to the gestures list.
	 */
	trainer.on('gesture-created', function(gestureName, trainingSkipped) {
		
		/*
		 * Since a new gesture is being created, we need to add an entry in the gesture list
		 */
		var gesture = $('<li' + (trainingSkipped ? '' : ' class="selected"') +'><span class="gesture-name">' + gestureName + 
						'</span><img class="training-arrow" src="./trainer-ui/images/training-arrow.png" />' + 
						'<img class="export-arrow" src="./trainer-ui/images/export-arrow.png" />' + 
						'<span class="training-label">' + (trainingSkipped ? RECOGNIZED : RECORDING) +
						'</span><span class="export-gesture">' + EXPORT + '</span></li>');

		gesture.click(function() { openExportOverlay(gesture, gestureName); });
		
		var items = existingGestureList.find('li');
		
		if (items.length == 0) {
			
			existingGestureList.append(gesture);
			
		} else {

			/*
			 * If there are already other gestures in the list we make sure to unselect the currently selected one.
			 */
			existingGestureList.find('li').removeClass('selected');

			$("#existing-gesture-list li").first().before(gesture);
		}

		/*
		 * We fire an update on the fancy scroll-bar to ensure it accounts for the increased height of the list
		 */
		existingGestures.trigger('mousewheel.perfect-scroll');
		
		/*
		 * We reset the input box
		 */
		newGestureName.val('');
		newGestureName.blur();

		/*
		 * We add the new gesture to the interface configuration option lists
		 */
	    openConfiguration.append('<option value="' + gestureName + '">' + gestureName + '</option>');
	    closeConfiguration.append('<option value="' + gestureName + '">' + gestureName + '</option>');
	    exportCloseOverlay.append('<option value="' + gestureName + '">' + gestureName + '</option>');
	});

	/*
	 * 
	 */
	trainer.on('training-started', function(gestureName) {

		setOutputText(gestureName, 'Recording', 'Perform the ' + gestureName.toUpperCase() + ' gesture ' + trainer.trainingGestures + ' times');

		output.val(0).trigger('change').trigger('configure', { fgColor: yellow });
	});

	/*
	 * Now we bind the training listeners.
	 */
	trainer.on('training-gesture-saved', function(gestureName, trainingSet) {

		var trainingGestures = trainer.trainingGestures;
		
		var remaining = (trainingGestures - trainingSet.length);

		output.val(100 - ((100/trainingGestures) * remaining)).trigger('change');
		
		setOutputText(gestureName, 'Recording', 'Perform the ' + gestureName.toUpperCase() + ' gesture ' + (remaining == 1 ? ' once more' : remaining + ' more times'));
	});
	
	/*
	 * 
	 */
	trainer.on('training-complete', function(gestureName, trainingSet) {

		output.val(100).trigger('change').trigger('configure', { fgColor: green });

		setOutputText(gestureName + '!', 'Learned');

		existingGestureList.find('li').removeClass('selected');
		
		existingGestureList.find('.gesture-name').each(function() {
			
			var g = $(this); if (g.html() == gestureName) { g.next().next().html(RECOGNIZED); };
		});
	});

	/*
	 * 
	 */
	trainer.on('gesture-recognized', function(hit, gestureName) {

		setOutputText(gestureName, null, hit);

		output.val(100 * hit).trigger('change').trigger('configure', { fgColor: green });

		existingGestureList.find('li').removeClass('selected hit');
		
		existingGestureList.find('.gesture-name').each(function() {
			
			var g = $(this); if (g.html() == gestureName) { g.parent().addClass('selected hit'); g.next().next().next().html(RECOGNIZED); }
		});
	});	

	/*
	 * 
	 */
	trainer.on('gesture-unknown', function(highestHit, closestGesture) {

		if (existingGestureList.find('li').length > 0) { setOutputText(); }

		output.val(100 * highestHit).trigger('change').trigger('configure', { fgColor: grey });
		
		existingGestureList.find('li').removeClass('selected hit');
	});

	/*
	 * We create a function to update the activity chart
	 */
	function updateChart(gestureActivity, recordedFrames) {

		frames  		= gestureActivity.length/recordedFrames;
		
		labels.length 	= 0;
		datasets.length = 0;

		for (var i = 0, l = frames; i < l; i++) { 
			
			labels.push(i + 1); 
			
			data = [];
			
			for (var j = 0; j < frames; j++) { data.push((gestureActivity[(i * frames) + j])); }
			
			datasets.push({
				fillColor 			: chartFill,
				strokeColor 		: chartStroke,
				pointColor 			: chartPoint,
				pointStrokeColor 	: chartPointStroke,
				data 				: data,
				bezierCurve			: false
			});
		}

		chart.Line({ labels				: labels, 
					 datasets			: datasets }, { 
					 scaleFontFamily	: scaleFontFamily, 
					 scaleLineColor		: scaleLineColor,
					 scaleLineWidth		: scaleLineWidth,
					 scaleGridLineWidth	: scaleGridLineWidth,
					 scaleFontColor		: scaleFontColor,
					 scaleFontStyle		: scaleFontStyle,
					 scaleGridLineColor	: scaleGridLineColor,
					 datasetStrokeWidth	: datasetStrokeWidth});
	}
	
	/*
	 * Then we bind the update funtion to the gesture-detected event
	 */
	trainer.on('gesture-detected', updateChart);

	/*
	 * And initialize an empty chart
	 */
    updateChart([1, 1, 1, 1, 1, 1, 1, 1, 1, 1], 1);
	
	/*
	 * Now we set up the leap controller listeners
	 */
	controller.on('connect', function() { setOutputText('Ready!', null, 'Create a gesture to get started'); });

	controller.on('deviceConnected', function() {
	  
		output.val(100).trigger('change').trigger('configure', { fgColor: green });
		
		setOutputText('Connected!', null, ' The connection to your Leap Motion has been restored!');
	});

	controller.on('deviceDisconnected', function() {
	  
		output.val(100).trigger('change').trigger('configure', { fgColor: red });
		
		setOutputText('Disconnected!', null, ' Check the connection to your Leap Motion!');
	});

	/*
	 * And finally connect to the device
	 */
	controller.connect();
});