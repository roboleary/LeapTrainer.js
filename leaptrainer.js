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
 * 
 * ------------------------------------------- NOTE -------------------------------------------
 *
 * The default recognition function in this version of LeapTrainer is geometric template matching.  
 * 
 * The implementation below is based on work at the University of Washington, described here:
 * 
 * 	http://depts.washington.edu/aimgroup/proj/dollar/pdollar.html
 * 
 * This implementation has been somewhat modified, functions in three dimensions, and has been 
 * optimized for performance.
 * 
 * --------------------------------------------------------------------------------------------
 */

/**
 * Create the LeapTrainer namespace.
 */
var LeapTrainer = {};

/**
 * Create the basic class structure.
 * 
 * This root class provides the inheritance mechanism for defining alternative implementations as sub-classes of 
 * the LeapTrainer.Controller.  For example:
 * 
 * 	LeapTrainer.SVMController = LeapTrainer.Controller.extend({
 * 
 * 		recognize: function(gesture, frameCount) { ...Match using support vector machines... });
 *  });
 *  
 *  To call an overidden function, use "this._super". For example:
 *  
 * 	LeapTrainer.FrameLoggingController = LeapTrainer.Controller.extend({
 * 
 * 		recordFrame: function(frame, lastFrame, recordVector, recordValue) { 
 * 
 * 			this._super(options); //Calls the LeapController.recordFrame function
 * 
 * 			this.logFrame(frame);
 * 		});
 *  });  
 */
(function() {

	var initializing = false, fnTest = /xyz/.test(function() { xyz; }) ? /\b_super\b/ : /.*/;

	/*
	 * We create the base Class implementation and give it an 'extend' method
	 */
	this.Class = function() {};

	Class.extend = function(prop) {

		var _super = this.prototype;

		initializing = true, prototype = new this(); //Instantiate a base class - but don't run the initialization function yet
		
		initializing = false;

		/*
		 * Copy the properties over onto the new prototype
		 */
		for (var name in prop) {

			/*
			 * Check if we're overwriting an existing function
			 */
			prototype[name] = typeof prop[name] == "function" && typeof _super[name] == "function" && fnTest.test(prop[name]) ? (function(name, fn) {

				return function() {

					var tmp = this._super;

					this._super = _super[name]; // Add a new ._super() method that is the same method but on the super-class
					
					var ret = fn.apply(this, arguments); // The method only need to be bound temporarily, so we remove it when we're done executing

					this._super = tmp;

					return ret;
				};

			})(name, prop[name]) : prop[name];
		}

		/*
		 * This is root class constructor.  All the construction work is actually done in the initialize method.
		 */
		function Class() { if (!initializing && this.initialize) { this.initialize.apply(this, arguments); }}

		Class.prototype 			= prototype; 		//Populate our constructed prototype object
		Class.prototype.constructor = Class; 			//Enforce the constructor to be what we expect
		Class.extend 				= arguments.callee; //And make this class extendable
		Class.overidden 			= prop; 			//And store the list of overridden fields

		return Class;
	};
})();

/**
 * Now we get to defining the base LeapTrainer Controller.  This class contains the default implementations of all functions.
 * 
 * The constructor accepts an options parameter, which is then passed to the initialize in order to set up the object.
 * 
 */
LeapTrainer.Controller = Class.extend({
	
	controller				: null,	// An instance of Leap.Controller from the leap.js library.  This will be created if not passed as an option
	
	pauseOnWindowBlur		: false, // If this is TRUE, then recording and recognition are paused when the window loses the focus, and restarted when it's regained
	
	minRecordingVelocity	: 300,	// The minimum velocity a frame needs to clock in at to trigger gesture recording, or below to stop gesture recording (by default)
	maxRecordingVelocity	: 30,	// The maximum velocity a frame can measure at and still trigger pose recording, or above which to stop pose recording (by default)
	
	minGestureFrames		: 5,	// The minimum number of recorded frames considered as possibly containing a recognisable gesture 
	minPoseFrames			: 75,	// The minimum number of frames that need to hit as recordable before pose recording is actually triggered
	
	recordedPoseFrames		: 0,	// A counter for recording how many pose frames have been recorded before triggering
	recordingPose			: false,// A flag to indicate if a pose is currently being recorded
	
	hitThreshold			: 0.65,	// The correlation output value above which a gesture is considered recognized. Raise this to make matching more strict

	trainingCountdown		: 3,	// The number of seconds after startTraining is called that training begins. This number of 'training-countdown' events will be emit.
	trainingGestures		: 1,	// The number of gestures samples that collected during training
	convolutionFactor		: 0,	// The factor by which training samples will be convolved over a gaussian distribution to expand the available training data

	downtime				: 1000,	// The number of milliseconds after a gesture is identified before another gesture recording cycle can begin
	lastHit					: 0,	// The timestamp at which the last gesture was identified (recognized or not), used when calculating downtime
	
	gestures				: {},	// The current set of recorded gestures - names mapped to convolved training data
	poses					: {},	// Though all gesture data is stored in the gestures object, here we hold flags indicating which gestures were recorded as poses
	
	trainingGesture			: null, // The name of the gesture currently being trained, or null if training is not active
	listeners				: {},	// Listeners registered to receive events emit from the trainer - event names mapped to arrays of listener functions

	paused					: false,// This variable is set by the pause() method and unset by the resume() method - when true it disables frame monitoring temporarily.

	renderableGesture		: null, // Implementations that record a gestures for graphical rendering should store the data for the last detected gesture in this array.
	
	/**
	 * The controller initialization function - this is called just after a new instance of the controller is created to parse the options array, 
	 * connect to the Leap Motion device (unless an existing Leap.Controller object was passed as a parameter), and register a frame listener with 
	 * the leap controller.
	 * 
	 * @param options
	 */
	initialize: function(options) {

		/*
		 * The options array overrides all parts of this object - so any of the values above or any function below can be overridden by passing it as a parameter.
		 */
		if (options) { for (var optionName in options) { if (options.hasOwnProperty(optionName)) { this[optionName] = options[optionName]; };};}
		
		/*
		 * The current DEFAULT recognition algorithm is geometric template matching - which is initialized here.
		 */
		this.templateMatcher = new LeapTrainer.TemplateMatcher();
		
		/*
		 * If no Leap.Controller object was passed on the options array one is created
		 */
		var connectController = !this.controller;
		
		if (connectController) { this.controller = new Leap.Controller(); }

		/*
		 * The bindFrameListener attaches a function to the leap controller frame event below.
		 */
		this.bindFrameListener();

		/*
		 * Finally, if no Leap.Controller was passed as a parameter to the trainer constructor, we connect to the device.
		 */
		if (connectController) { this.controller.connect(); };
	},

	/**
	 * The onFrame function is defined below in the bindFrameListener function in order to allow locally scoped variables be 
	 * defined for use on each frame.
	 */
	onFrame: function () {},
	
	/**
 	 * This function binds a listener to the Leap.Controller frame event in order to monitor activity coming from the device.
 	 * 
 	 * This bound frame listener function fires the 'gesture-detected', 'started-recording', and 'stopped-recording' events.
	 * 
	 */
	bindFrameListener: function () {

		/*
		 * Variables are declared locally here once in order to minimize variable creation and lookup in the high-speed frame listener.
		 */
		var recording = false, frameCount = 0, gesture = [],

		/*
		 * These two utility functions are used to push a vector (a 3-variable array of numbers) into the gesture array - which is the 
		 * array used to store activity in a gesture during recording. NaNs are replaced with 0.0, though they shouldn't occur!
		 */
	 	recordValue		 = function (val) 	{ gesture.push(isNaN(val) ? 0.0 : val); },
	 	recordVector	 = function (v) 	{ recordValue(v[0]); recordValue(v[1]); recordValue(v[2]); };

	 	/**
	 	 * 
	 	 */
	 	this.onFrame = function(frame) {		
			
	 		/*
	 		 * The pause() and resume() methods can be used to temporarily disable frame monitoring.
	 		 */
	 		if (this.paused) { return; }

	 		/*
	 		 * Frames are ignored if they occur too soon after a gesture was recognized.
	 		 */
	 		if (new Date().getTime() - this.lastHit < this.downtime) { return; }

	 		/*
			 * The recordableFrame function returns true or false - by default based on the overall velocity of the hands and pointables in the frame.  
			 * 
			 * If it returns true recording should either start, or the current frame should be added to the existing recording.  
			 * 
			 * If it returns false AND we're currently recording, then gesture recording has completed and the recognition function should be 
			 * called to see what it can do with the collected frames.
			 * 
			 */
			if (this.recordableFrame(frame, this.minRecordingVelocity, this.maxRecordingVelocity)) {
	
				/*
				 * If this is the first frame in a gesture, we clean up some running values and fire the 'started-recording' event.
				 */
				if (!recording) { 
					
					recording 				= true; 
					frameCount 				= 0; 
					gesture 				= []; 
					this.renderableGesture 	= []; 
					this.recordedPoseFrames = 0;

					this.fire('started-recording'); 
				}

				/*
				 * We count the number of frames recorded in a gesture in order to check that the 
				 * frame count is greater than minGestureFrames when recording is complete.
				 */
				frameCount++;
	
				/*
				 * The recordFrame function may be overridden, but in any case it's passed the current frame, the previous frame, and 
				 * utility functions for adding vectors and individual values to the recorded gesture activity.
				 */
				this.recordFrame(frame, this.controller.frame(1), recordVector, recordValue);

				/*
				 * Since renderable frame data is not necessarily the same as frame data used for recognition, a renderable frame will be 
				 * recorded here IF the implementation provides one.
				 */
				this.recordRenderableFrame(frame, this.controller.frame(1));
				
			} else if (recording) {

				/*
				 * If the frame should not be recorded but recording was active, then we deactivate recording and check to see if enough 
				 * frames have been recorded to qualify for gesture recognition.
				 */
				recording = false;
				
				/*
				 * As soon as we're no longer recording, we fire the 'stopped-recording' event
				 */
				this.fire('stopped-recording');
	
				if (this.recordingPose || frameCount >= this.minGestureFrames) {

					/*
					 * If a valid gesture was detected the 'gesture-detected' event fires, regardless of whether the gesture will be recognized or not.
					 */
					this.fire('gesture-detected', gesture, frameCount);
					
					/*
					 * Finally we pass the recorded gesture frames to either the saveTrainingGesture or recognize functions (either of which may also 
					 * be overridden) depending on whether we're currently training a gesture or not.
					 * the time of the last hit.
					 */
					var gestureName = this.trainingGesture;

					if (gestureName) { this.saveTrainingGesture(gestureName, gesture, this.recordingPose);

					} else { this.recognize(gesture, frameCount); }

					this.lastHit = new Date().getTime();

					this.recordingPose 		= false;
				};
			};
			
		}; // The frame listener is bound to the context of the LeapTrainer object

	 	/**
	 	 * This is the frame listening function, which will be called by the Leap.Controller on every frame.
	 	 */
		this.controller.on('frame',	this.onFrame.bind(this)); 
		
		/*
		 * If pauseOnWindowBlur is true, then we bind the pause function to the controller blur event and the resume 
		 * function to the controller focus event
		 */
		if (this.pauseOnWindowBlur) {

			this.controller.on('blur',	this.pause.bind(this));
			this.controller.on('focus',	this.resume.bind(this)); 			
		}
	},
	
	/**
	 * This function returns TRUE if the provided frame should trigger recording and FALSE if it should stop recording.  
	 * 
	 * Of course, if the system isn't already recording, returning FALSE does nothing, and vice versa.. So really it returns 
	 * whether or not a frame may possibly be part of a gesture.
	 * 
	 * By default this function makes its decision based on one or more hands or fingers in the frame moving faster than the 
	 * configured minRecordingVelocity, which is provided as a second parameter.
	 * 
	 * @param frame
	 * @param min
	 * @returns {Boolean}
	 */
	recordableFrame: function (frame, min, max) {

		var hands = frame.hands, j, hand, fingers, palmVelocity, tipVelocity, poseRecordable = false;
		
		for (var i = 0, l = hands.length; i < l; i++) {
			
			hand = hands[i];

			palmVelocity = hand.palmVelocity;

			palmVelocity = Math.max(Math.abs(palmVelocity[0]), Math.abs(palmVelocity[1]), Math.abs(palmVelocity[2]));
			
			/*
			 * We return true if there is a hand moving above the minimum recording velocity
			 */
			if (palmVelocity >= min) { return true; }
			
			if (palmVelocity <= max) { poseRecordable = true; break; }
			
			fingers = hand.fingers;
			
			for (j = 0, k = fingers.length; j < k; j++) {

				tipVelocity = fingers[j].tipVelocity;

				tipVelocity = Math.max(Math.abs(tipVelocity[0]), Math.abs(tipVelocity[1]), Math.abs(tipVelocity[2]));
				
				/*
				 * Or if there's a finger tip moving above the minimum recording velocity
				 */
				if (tipVelocity >= min) { return true; }
				
				if (tipVelocity <= max) { poseRecordable = true; break; }
			};	
		};

		/*
		 * A configurable number of frames have to hit as pose recordable before actual recording is triggered.
		 */
		if (poseRecordable) {
			
			this.recordedPoseFrames++;
			
			if (this.recordedPoseFrames >= this.minPoseFrames) {

				this.recordingPose = true;
				
				return true;
			}

		} else {
			
			this.recordedPoseFrames = 0;
		}
	},
	
	/**
	 * This function is called for each frame during gesture recording, and it is responsible for adding values in frames using the provided 
	 * recordVector and recordValue functions (which accept a 3-value numeric array and a single numeric value respectively).
	 * 
	 * This function should be overridden to modify the quality and quantity of data recorded for gesture recognition.
	 * 
	 * @param frame
	 * @param lastFrame
	 * @param recordVector
	 * @param recordValue
	 */
	recordFrame: function(frame, lastFrame, recordVector, recordValue) {
		
		var hands		= frame.hands;
		var handCount 	= hands.length;

		var hand, finger, fingers, fingerCount;

		for (var i = 0, l = handCount; i < l; i++) {
			
			hand = hands[i];

			recordVector(hand.stabilizedPalmPosition);

			fingers 	= hand.fingers;
			fingerCount = fingers.length;
			
			for (var j = 0, k = fingerCount; j < k; j++) {
				
				finger = fingers[j];

				recordVector(finger.stabilizedTipPosition);	
			};
		};
	},
	
	/**
	 * This function records a single frame in a format suited for graphical rendering.  Since the recordFrame function will capture 
	 * data suitable for whatever recognition algorithm is implemented, that data is not necessarily relating to geometric positioning 
	 * of detected hands and fingers.  Consequently, this function should capture this geometric data.
	 * 
	 * Currently, only the last recorded gesture is stored - so this function should just write to the renderableGesture array.
	 * 
	 * Any format can be used - but the format expected by the LeapTrainer UI is - for each hand:
	 * 
	 * 	{	position: 	[x, y, z], 
	 * 	 	direction: 	[x, y, z], 
	 * 	 	palmNormal	[x, y, z], 
	 * 
	 * 		fingers: 	[ { position: [x, y, z], direction: [x, y, z], length: q },
	 * 					  { position: [x, y, z], direction: [x, y, z], length: q },
	 * 					  ... ]
	 *  }
	 *  
	 *  So a frame containing two hands would push an array with two objects like that above into the renderableGesture array.
	 * 
	 * @param frame
	 * @param lastFrame
	 * @param recordVector
	 * @param recordValue
	 */
	recordRenderableFrame: function(frame, lastFrame) {
		
		var frameData = [];
		
		var hands		= frame.hands;
		var handCount 	= hands.length;

		var hand, finger, fingers, fingerCount, handData, fingersData;
		
		for (var i = 0, l = handCount; i < l; i++) {
			
			hand = hands[i];

			handData = {position: hand.stabilizedPalmPosition, direction: hand.direction, palmNormal: hand.palmNormal};

			fingers 	= hand.fingers;
			fingerCount = fingers.length;
			
			fingersData = [];

			for (var j = 0, k = fingerCount; j < k; j++) {
				
				finger = fingers[j];

				fingersData.push({position: finger.stabilizedTipPosition, direction: finger.direction, length: finger.length});
			};
			
			handData.fingers = fingersData;
			
			frameData.push(handData);
		};
		
		this.renderableGesture.push(frameData);
	},
	
	/**
	 * This function is called to create a new gesture, and - normally - trigger training for that gesture.  
	 * 
	 * The parameter gesture name is added to the gestures array and unless the trainLater parameter is present, the startRecording 
	 * function below is triggered.
	 * 
	 * This function fires the 'gesture-created' event.
	 * 
	 * @param gestureName
	 * @param trainLater
	 */
	create: function(gestureName, skipTraining) {
		
		this.gestures[gestureName] 	= [];
		
		this.fire('gesture-created', gestureName, skipTraining);

		if (typeof skipTraining == 'undefined' || !skipTraining) { this.pause(); this.startTraining(gestureName, this.trainingCountdown); }
	},

	/**
	 * This function sets the object-level trainingGesture variable. This modifies what happens when a gesture is detected 
	 * by determining whether we save it as a training gesture or attempting to recognize it.
	 * 
	 * Since training actually starts after a countdown, this function will recur a number of times before the framework enters 
	 * training mode.  Each time it recurs it emits a 'training-countdown' event with the number of recursions still to go.  Consequently, 
	 * this function is normally initially called by passing this.trainingCountdown as the second parameter.
	 * 
	 * This function fires the 'training-started' and 'training-countdown' events.
	 * 
	 * @param gestureName
	 * @param countdown
	 */
	startTraining: function(gestureName, countdown) { 

		if (countdown > 0) {

			this.fire('training-countdown', countdown);
			
			countdown--;
			
			setTimeout(function() { this.startTraining(gestureName, countdown); }.bind(this), 1000);
			
			return;
		} 
		
		this.resume();
		
		this.trainingGesture = gestureName; 

		this.fire('training-started', gestureName);
	},
	
	/**
	 * Deletes the set of training gestures associated with the provided gesture name, and re-enters training mode for that gesture. 
	 * 
	 * If the provided name is unknown, then this function will return FALSE.  Otherwise it will call the 
	 * startTraining function (resulting in a 'training-started' event being fired) and return TRUE.
	 * 
	 * @param gestureName
	 * @returns {Boolean}
	 */
	retrain: function(gestureName) { 
		
		var storedGestures = this.gestures[gestureName];
		
		if (storedGestures) {
			
			storedGestures.length = 0;

			this.startTraining(gestureName, this.trainingCountdown);
			
			return true;
		}
		
		return false;
	},

	/**
	 * For recognition algorithms that need a training operation after training data is gathered, but before the 
	 * gesture can be recognized, this function can be implemented and will be called in the 'saveTrainingGesture' function 
	 * below when training data has been collected for a new gesture.
	 * 
	 * The current DEFAULT implementation of this function calls a LeapTrainer.TemplateMatcher in order to process the saved 
	 * gesture data in preparation for matching.
	 * 
	 * Sub-classes that implement different recognition algorithms SHOULD override this function.
	 * 
	 * @param gestureName
	 * @param trainingGestures
	 */
	trainAlgorithm: function (gestureName, trainingGestures) {
		
		for (var i = 0, l = trainingGestures.length; i < l; i++) { 

			trainingGestures[i] = this.templateMatcher.process(trainingGestures[i]);
		}		
	},

	/**
	 * The saveTrainingGesture function records a single training gesture.  If the number of saved training gestures has reached 
	 * 'trainingGestures', the training is complete and the system switches back out of training mode.
	 * 
	 * This function fires the 'training-complete' and 'training-gesture-saved' events.
	 * 
	 * @param gestureName
	 * @param gesture
	 */
	saveTrainingGesture: function(gestureName, gesture, isPose) {
		
		/*
		 * We retrieve all gestures recorded for this gesture name so far
		 */
		var trainingGestures = this.gestures[gestureName];
		
		/*
		 * Save the newly recorded gesture data
		 */
		trainingGestures.push(gesture);

		/*
		 * And check if we have enough saved gestures to complete training
		 */
		if (trainingGestures.length == this.trainingGestures) { 

			/*
			 * We expand the training data by generating a gaussian normalized distribution around the input.  This increases the 
			 * number of training gestures used during recognition, without demanding more training samples from the user.
			 */
			this.gestures[gestureName] = this.distribute(trainingGestures);

			/*
			 * Whether or not the gesture was recorded as a pose is stored
			 */
			this.poses[gestureName] = isPose;
			
			/*
			 * Setting the trainingGesture variable back to NULL ensures that the system will attempt to recognize subsequent gestures 
			 * rather than save them as training data.
			 */
			this.trainingGesture = null;

			/*
			 * The trainAlgorithm function provides an opportunity for machine learning recognition systems to train themselves on 
			 * the full training data set before the training cycle completes.
			 */
			this.trainAlgorithm(gestureName, trainingGestures);
			
			/*
			 * Finally we fire the 'training-complete' event.
			 */
			this.fire('training-complete', gestureName, trainingGestures, isPose);

		} else { 

			/*
			 * If more training gestures are required we just fire the 'training-gesture-saved' event.
			 */
			this.fire('training-gesture-saved', gestureName, trainingGestures);
		}
	},

	/**
	 * This function generates a normalized distribution of values around a set of recorded training gestures.  The objective of 
	 * this function is to increase the size of the training data without actually requiring the user to perform more training 
	 * gestures.
	 * 
	 * This implementation generates a gaussian normalized distribution.
	 * 
	 * @param trainingGestures
	 * @returns
	 */
	distribute: function (trainingGestures) {

		var factor = this.convolutionFactor;
		
		/*
		 * If the convolutionFactor is set to zero no distribution is generation.
		 */
		if (factor == 0) { return trainingGestures; }
		
		var gesture, generatedGesture, value;

		/*
		 * For convolutionFactor times
		 */
		for (var i = 0, p = factor; i < p; i++) {
			
			/*
			 * For each training gesture
			 */
			for (var j = 0, l = trainingGestures.length; j < l; j++) {
				
				gesture 				= trainingGestures[j];
				generatedGesture 		= [];

				/*
				 * For each value in the training gesture
				 */
				for (var k = 0, m = gesture.length; k < m; k++) {
					
					value = gesture[k];
					
					/*
					 * Generate a random point within a normalized gaussian distribution
					 */
					generatedGesture[k] = Math.round((Math.random()*2 - 1) + 
													 (Math.random()*2 - 1) + 
													 (Math.random()*2 - 1) * 
													 ((value * 10000) / 50) + (value * 10000)) / 10000;
				}
				
				/*
				 * Add the generated gesture to the trainingGesture array
				 */
				trainingGestures.push(generatedGesture);
			}	
		}

		/*
		 * Return the expanded trainingGestures array
		 */
		return trainingGestures;
	},
	
	/**
	 * This function matches a parameter gesture against the known set of saved gestures.  
	 * 
	 * This function does not need to return any value, but it should fire either the 'gesture-recognized' or 
	 * the 'gesture-unknown' event.  
	 * 
	 * The 'gesture-recognized' event includes a numeric value for the closest match, the name of the recognized 
	 * gesture, and a list of hit values for all known gestures as parameters.  The list maps gesture names to 
	 * hit values.
	 * 
	 * The 'gesture-unknown' event, includes a list of gesture names mapped to hit values for all known gestures 
	 * as a parameter.
	 * 
	 * If a gesture is recognized, an event with the name of the gesture and no parameters will also be fired. So 
	 * listeners waiting for a 'Punch' gestures, for example, can just register for events using: 
	 * 
	 * 		trainer.on('Punch').
	 * 
	 * @param gesture
	 * @param frameCount
	 */
	recognize: function(gesture, frameCount) {

		var gestures 			= this.gestures,
			threshold			= this.hitThreshold,
			allHits				= {},
			hit					= 0,
			bestHit				= 0,
			recognized			= false,
			closestGestureName	= null,
			recognizingPose		= (frameCount == 1); //Single-frame recordings are idenfied as poses

		/*
		 * We cycle through all known gestures
		 */
		for (var gestureName in gestures) {

			/*
			 * We don't actually attempt to compare gestures to poses
			 */
			if (this.poses[gestureName] != recognizingPose) { 
				
				hit = 0.0;
				
			} else {

				/*
				 * For each know gesture we generate a correlation value between the parameter gesture and a saved 
				 * set of training gestures. This correlation value is a numeric value between 0.0 and 1.0 describing how similar 
				 * this gesture is to the training set.
				 */
				hit = this.correlate(gestureName, gestures[gestureName], gesture);				
			}

			/*
			 * Each hit is recorded
			 */
			allHits[gestureName] = hit;
			
			/*
			 * If the hit is equal to or greater than the configured hitThreshold, the gesture is considered a match.
			 */
			if (hit >= threshold) { recognized = true; }

			/*
			 * If the hit is higher than the best hit so far, this gesture is stored as the closest match.
			 */
			if (hit > bestHit) { bestHit = hit; closestGestureName = gestureName; }
		}

		if (recognized) { 

			this.fire('gesture-recognized', bestHit, closestGestureName, allHits);

			this.fire(closestGestureName); 
		
		} else {
		
			this.fire('gesture-unknown', allHits);
		}
	},

	/**
	 * This function accepts a set of training gestures and a newly input gesture and produces a number between 0.0 and 1.0 describing 
	 * how closely the input gesture resembles the set of training gestures.
	 * 
	 * This DEFAULT implementation uses a LeapTrainer.TemplateMatcher to perform correlation.
	 * 
	 * @param gestureName
	 * @param trainingGestures
	 * @param gesture
	 * @returns {Number}
	 */
	correlate: function(gestureName, trainingGestures, gesture) {

		gesture = this.templateMatcher.process(gesture);

		var nearest = +Infinity, foundMatch = false, distance;

		for (var i = 0, l = trainingGestures.length; i < l; i++) {
			
			distance = this.templateMatcher.match(gesture, trainingGestures[i]);
			
			if (distance < nearest) {

				/*
				 * 'distance' here is the calculated distance between the parameter gesture and the training 
				 * gesture - so the smallest value indicates the closest match
				 */
				nearest = distance;

				foundMatch = true;
			}
		}

		return (!foundMatch) ? 0.0 : (Math.min(parseInt(100 * Math.max(nearest - 4.0) / -4.0, 0.0), 100)/100.0);
	},

	/**
	 * These three functions are used by the training UI to select alternative strategies - sub-classes should override these functions 
	 * with names for the algorithms they implement.
	 * 
	 * Each function should return a descriptive name of the strategy implemented.
	 */
	getRecordingTriggerStrategy : function() { return 'Frame velocity'; },

	/**
	 * This is the type and format of gesture data recorded by the recordFrame function.
	 */
	getFrameRecordingStrategy : function() { return '3D Geometric Positioning'; },
	
	/**
	 * This is the name of the mechanism used to recognize learned gestures.
	 */
	getRecognitionStrategy : function() { return 'Geometric Template Matching'; },
	
	/**
	 * This function converts the requested stored gesture into a JSON string containing the gesture name and training data.  
	 * 
	 * Gestures exported using this function can be re-imported using the fromJSON function below.
	 * 
	 * @param gestureName
	 * @returns {String}
	 */
	toJSON: function(gestureName) {
		
		var gesture = this.gestures[gestureName];
		
		if (gesture) { return JSON.stringify({name: gestureName, pose: this.poses[gestureName] ? true : false, data: gesture}); }
	},
	
	/**
	 * This is a simple import function for restoring gestures exported using the toJSON function above.
	 * 
	 * It returns the object parsed out of the JSON, so that overriding implementations can make use of this function.
	 * 
	 * @param json
	 * @returns {Object}
	 */
	fromJSON: function(json) {

		var imp = JSON.parse(json);
		
		var gestureName = imp.name;
		
		this.create(gestureName, true);
		
		this.gestures[gestureName] = imp.data;
		
		this.poses[gestureName] = imp.pose;
		
		return imp;
	},

	/**
	 * This is a standard event registration event - paired with the fire event below, it provides an event-oriented 
	 * mechanism for notifying external components when significant events happen - gestures being matching, training 
	 * cycles starting and ending, etc.
	 * 
	 * @param event
	 * @param listener
	 * @returns {Object} The leaptrainer controller, for chaining.
	 */
	on: function(event, listener) {
		
		var listening = this.listeners[event];
		
		if (!listening) { listening = []; }
		
		listening.push(listener);
		
		this.listeners[event] = listening;
		
		return this;
	},
	
	/**
	 * This function removes an event listener previously bound using the on() function above.
	 * 
	 * @param event
	 * @param listener
	 * @returns {Object} The leaptrainer controller, for chaining.
	 */
	off: function(event, listener) {
		
		if (!event) { return this; }
		
		var listening = this.listeners[event];
		
		if (listening) { 
			
			listening.splice(listening.indexOf(listener), 1);
			
			this.listeners[event] = listening;
		}
		
		return this;
	},
	
	/**
	 * This function is called in various function above in order to notify listening components when the events they're 
	 * registered to hear occur.
	 * 
	 * This function accepts an arbitrary number of arguments, all of which will be passed on to listening functions except the 
	 * first (so not quite arbitrary.. (arbitrary + 1)), which is the name of the event being fired.
	 * 
	 * @param event
	 * @returns {Object} The leaptrainer controller, for chaining.
	 */
	fire: function(event) {
		
		var listening = this.listeners[event];
		
		if (listening) { 
			
			var args = Array.prototype.slice.call(arguments);

			args.shift();

			for (var i = 0, l = listening.length; i < l; i++) { listening[i].apply(this, args); }
		}
		
		return this;
	},

	/**
	 * This function temporarily disables frame monitoring.
	 * 
	 * @returns {Object} The leaptrainer controller, for chaining.
	 */
	pause: function() { this.paused = true; return this; },
	
	/**
	 * This function resumes paused frame monitoring.
	 * 
	 * @returns {Object} The leaptrainer controller, for chaining.
	 */
	resume: function() { this.paused = false; return this; },
	
	/**
	 * This function unbinds the controller from the leap frame event cycle - making it inactive and ready 
	 * for cleanup.
	 */
	destroy: function() { this.controller.removeListener('frame', this.onFrame); }
});


/*!
 * --------------------------------------------------------------------------------------------------------
 * 
 * 										GEOMETRIC TEMPLATE MATCHER
 * 
 * --------------------------------------------------------------------------------------------------------
 * 
 * Everything below this point is a geometric template matching implementation. This object implements the current 
 * DEFAULT default recognition strategy used by the framework.
 * 
 * This implementation is based on work at the University of Washington, described here:
 * 
 * 	http://depts.washington.edu/aimgroup/proj/dollar/pdollar.html
 * 
 * This implementation has been somewhat modified, functions in three dimensions, and has been 
 * optimized for performance.
 * 
 * Theoretically this implementation CAN support multi-stroke gestures - but there is not yet support in the LeapTrainer 
 * Controller or training UI for these kinds of gesture.
 * 
 * --------------------------------------------------------------------------------------------------------
 */

/**
 * A basic holding class for a 3D point. Note the final parameter, stroke, intended to indicate with which 
 * stroke in a multi-stroke gesture a point is associated - even if multi-stroke gestures are not yet supported 
 * by the framework.
 * 
 * @param x
 * @param y
 * @param z
 * @param stroke
 * @returns {LeapTrainer.Point}
 */
LeapTrainer.Point = function (x, y, z, stroke) {

	this.x = x;
	this.y = y;
	this.z = z;

	this.stroke = stroke; // stroke ID to which this point belongs (1,2,...)
};

/**
 * An implementation of the geometric template mathcing algorithm.
 */
LeapTrainer.TemplateMatcher = Class.extend({

	pointCount	: 25, 							// Gestures are resampled to this number of points
	origin 		: new LeapTrainer.Point(0,0,0), // Gestures are translated to be centered on this point

	/**
	 * Prepares a recorded gesture for template matching - resampling, scaling, and translating the gesture to the 
	 * origin.  Gesture processing ensures that during recognition, apples are compared to apples - all gestures are the 
	 * same (resampled) length, have the same scale, and share a centroid.
	 * 
	 * @param gesture
	 * @returns
	 */
	process: function(gesture) { 
	
		var points = [];
		
		var stroke = 1;

		for (var i = 0, l = gesture.length; i < l; i += 3) {

			points.push(new LeapTrainer.Point(gesture[i], gesture[i + 1], gesture[i + 2], stroke));
		}

		return this.translateTo(this.scale(this.resample(points, this.pointCount)), this.origin);	
	},	
	
	/**
	 * This is the primary correlation function, called in the LeapTrainer.Controller above in order to compare an detected 
	 * gesture with known gestures.  
	 * 
	 * @param gesture
	 * @param trainingGesture
	 * @returns
	 */
	match: function (gesture, trainingGesture) {

		var l 			= gesture.length, 
			step 		= Math.floor(Math.pow(l, 1 - this.e)), 
			min 		= +Infinity,
			minf 		= Math.min;
		
		for (var i = 0; i < l; i += step) {

			min = minf(min, minf(this.gestureDistance(gesture, trainingGesture, i), this.gestureDistance(trainingGesture, gesture, i)));
		}

		return min;
	},
	
	/**
	 * Calculates the geometric distance between two gestures.
	 * 
	 * @param gesture1
	 * @param gesture2
	 * @param start
	 * @returns {Number}
	 */
	gestureDistance: function (gesture1, gesture2, start) {

		var p1l = gesture1.length;

		var matched = new Array(p1l);

		var sum = 0, i = start, index, min, d;

		do {

			index = -1, min = +Infinity;

			for (var j = 0; j < p1l; j++) {

				if (!matched[j]) {

					if (gesture1[i] == null || gesture2[j] == null) { continue; }
					
					d = this.distance(gesture1[i], gesture2[j]);

					if (d < min) { min = d; index = j; }
				}
			}

			matched[index] = true;

			sum += (1 - ((i - start + p1l) % p1l) / p1l) * min;

			i = (i + 1) % p1l;
		
		} while (i != start);

		return sum;
	},
	
	/**
	 * Resamples a gesture in order to create gestures of homogenous lengths.  The second parameter indicates the length to 
	 * which to resample the gesture.
	 * 
	 * This function is used to homogenize the lengths of gestures, in order to make them more comparable. 
	 * 
	 * @param gesture
	 * @param newLength
	 * @returns {Array}
	 */
	resample: function (gesture, newLength) {
		
		var target = newLength - 1;
		
		var interval = this.pathLength(gesture)/target, dist = 0.0, resampledGesture = new Array(gesture[0]), d, p, pp, ppx, ppy, ppz, q;
		
		for (var i = 1, l = gesture.length; i < l; i++) {

			p	= gesture[i];
			pp	= gesture[i - 1];
			
			if (p.stroke == pp.stroke) {

				d = this.distance(pp, p);

				if ((dist + d) >= interval) {
					
					ppx = pp.x;
					ppy = pp.y;
					ppz = pp.z;

					q = new LeapTrainer.Point((ppx + ((interval - dist) / d) * (p.x - ppx)), 
											  (ppy + ((interval - dist) / d) * (p.y - ppy)),
											  (ppz + ((interval - dist) / d) * (p.z - ppz)), p.stroke);
					
					resampledGesture.push(q);
					
					gesture.splice(i, 0, q);
					
					dist = 0.0;
				
				} else { 
				
					dist += d;
				}
			}
		}

		/*
		 * Rounding errors will occur short of adding the last point - in which case the array is padded by 
		 * duplicating the last point
		 */
		if (resampledGesture.length != target) {
			
			p = gesture[gesture.length - 1];
			
			resampledGesture.push(new LeapTrainer.Point(p.x, p.y, p.z, p.stroke));
		}

		return resampledGesture;
	},
	
	/**
	 * Scales gestures to homogenous variances in order to provide for detection of the same gesture at different scales.
	 * 
	 * @param gesture
	 * @returns {Array}
	 */
	scale: function (gesture) {

		var minX = +Infinity, 
			maxX = -Infinity, 
			minY = +Infinity, 
			maxY = -Infinity,
			minZ = +Infinity, 
			maxZ = -Infinity,
			l = gesture.length,
			g, x, y, z, 
			min = Math.min,
			max = Math.max;
		
		for (var i = 0; i < l; i++) {
			
			g = gesture[i];
			
			x = g.x;
			y = g.y;
			z = g.z;
			
			minX = min(minX, x);
			minY = min(minY, y);
			minZ = min(minZ, z);

			maxX = max(maxX, x);
			maxY = max(maxY, y);
			maxZ = max(maxZ, z);
		}

		var size = Math.max(maxX - minX, maxY - minY, maxZ - minZ);

		for (var i = 0; i < l; i++) {
			
			g = gesture[i];

			gesture[i] = new LeapTrainer.Point((g.x - minX)/size, (g.y - minY)/size, (g.z - minZ)/size, g.stroke);
		}

		return gesture;
	},

	/**
	 * Translates a gesture to the provided centroid.  This function is used to map all gestures to the 
	 * origin, in order to recognize gestures that are the same, but occurring at at different point in space.
	 * 
	 * @param gesture
	 * @param centroid
	 * @returns {Array}
	 */
	translateTo: function (gesture, centroid) {

		var center = this.centroid(gesture), g;

		for (var i = 0, l = gesture.length; i < l; i++) {
		
			g = gesture[i];

			gesture[i] = new LeapTrainer.Point((g.x + centroid.x - center.x), 
											   (g.y + centroid.y - center.y), 
											   (g.z + centroid.z - center.z), g.stroke);
		}

		return gesture;
	},
	
	/**
	 * Finds the center of a gesture by averaging the X and Y coordinates of all points in the gesture data.
	 * 
	 * @param gesture
	 * @returns {LeapTrainer.Point}
	 */
	centroid: function (gesture) {

		var x = 0.0, y = 0.0, z = 0.0, l = gesture.length, g;

		for (var i = 0; i < l; i++) {

			g = gesture[i];
			
			x += g.x;
			y += g.y;
			z += g.z;
		}

		return new LeapTrainer.Point(x/l, y/l, z/l, 0);
	},
	
	/**
	 * Calculates the average distance between corresponding points in two gestures
	 * 
	 * @param gesture1
	 * @param gesture2
	 * @returns {Number}
	 */
	pathDistance: function (gesture1, gesture2) {
		
		var d = 0.0, l = gesture1.length;
		
		/*
		 * Note that resampling has ensured that the two gestures are both the same length
		 */
		for (var i = 0; i < l; i++) { d += this.distance(gesture1[i], gesture2[i]); }

		return d/l;
	},
	
	/**
	 * Calculates the length traversed by a single point in a gesture
	 * 
	 * @param gesture
	 * @returns {Number}
	 */
	pathLength: function (gesture) {

		var d = 0.0, g, gg;

		for (var i = 1, l = gesture.length; i < l; i++) {

			g	= gesture[i];
			gg 	= gesture[i - 1];
			
			if (g.stroke == gg.stroke) { d += this.distance(gg, g); }
		}

		return d;
	},
	
	/**
	 * A simple Euclidean distance function
	 * 
	 * @param p1
	 * @param p2
	 * @returns
	 */
	distance: function (p1, p2) {

		var dx = p1.x - p2.x;
		var dy = p1.y - p2.y;
		var dz = p1.z - p2.z;

		return Math.sqrt(dx * dx + dy * dy + dz * dz);
	}	
});