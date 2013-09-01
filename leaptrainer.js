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
 * 		recognize: function(gesture) { ...Match using support vector machines... });
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
		
	minRecordingVelocity	: 400,	// The minimum velocity a frame needs to clock in at to trigger gesture recording, or below to stop recording (by default)
	minGestureFrames		: 5,	// The minimum number of recorded frames considered as possibly containing a recognisable gesture 
	hitThreshold			: 0.6,	// The cross-correlation output value above which a gesture is considered recognized. Raise this to make matching more strict

	trainingGestures		: 3,	// The number of gestures samples that collected during training
	convolutionFactor		: 3,	// The factor by which training samples will be convolved over a gaussian distribution to expand the available training data

	downtime				: 200,	// The number of milliseconds after a gesture is identified before another gesture recording cycle can begin
	lastHit					: 0,	// The timestamp at which the last gesture was identified (recognized or not), used when calculating downtime
	
	gestures				: {},	// The current set of recorded gestures - names mapped to convolved training data

	trainingGesture			: null, // The name of the gesture currently being trained, or null if training is not active
	listeners				: {},	// Listeners registered to receive events emit from the trainer - event names mapped to arrays of listener functions

	paused					: false,// This variable is set by the pause() method and unset by the resume() method - when true it disables frame monitoring temporarily.
	
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
 	 * This bound frame listener function fires the 'gesture-detected' event.
	 * 
	 */
	bindFrameListener: function () {

		/*
		 * Variables are declared locally here once in order to minimize variable creation and lookup in the high-speed frame listener.
		 */
		var recording = false, frameCount = 0, gesture = [];

		/*
		 * These two utility functions are used to push a vector (a 3-variable array of numbers) into the gesture array - which is the 
		 * array used to store activity in a gesture during recording. NaNs are replaced with 0.0, though they shouldn't occur!
		 */
	 	recordValue		= function (val) 	{ gesture.push(isNaN(val) ? 0.0 : Math.abs(val)); },

	 	recordVector	= function (v) 		{ recordValue(v[0]); recordValue(v[1]); recordValue(v[2]); };

	 	/**
	 	 * 
	 	 */
	 	this.onFrame = function(frame) {		
			
	 		/*
	 		 * The pause() and resume() methods can be used to temporarily disable frame monitoring.
	 		 */
	 		if (this.paused) { return; }
	 		
			/*
			 * Frames are ignored if they occur too soon after a gesture was recognized
			 */
			if (new Date().getTime() - this.lastHit < this.downtime) { return; }
			
			/*
			 * The recordableFrame function returns true or false - by default based on the overall velocity of the hands and pointables in the frame.  
			 * 
			 * If it returns true recording should either start, or the current frame should be added to the existing recording.  
			 * 
			 * If it returns false AND we're currently recording, then gesture recording has completed and the recognition function should be 
			 * called to see what it can do with the collected frames.
			 */
			if (this.recordableFrame(frame, this.minRecordingVelocity)) {
	
				/*
				 * If this is the first frame in a gesture, we clean up some running values.
				 */
				if (!recording) { recording = true; frameCount = 0; gesture = []; }
	
				/*
				 * We count the number of frames recorded in a gesture in order to check that the 
				 * frame count is greater than minGestureFrames when recording is complete.
				 */
				frameCount++;
	
				/*
				 * The recordFrame function may be overidden, but in any case it's passed the current frame, the previous frame, and 
				 * utility functions for adding vectors and individual values to the recorded gesture activity.
				 */
				this.recordFrame(frame, this.controller.frame(1), recordVector, recordValue);
	
			} else if (recording) {
	
				/*
				 * If the frame should not be recorded but recording was active, then we deactivate recording and check to see if enough 
				 * frames have been recorded to qualify for gesture recognition.
				 */
				recording = false;
	
				if (frameCount >= this.minGestureFrames) {
	
					/*
					 * If a valid gesture was detected the 'gesture-detected' event fires, regardless of whether the gesture will be recognized or not.
					 */
					this.fire('gesture-detected', gesture, frameCount);

					/*
					 * Finally we pass the recorded gesture frames to either the saveTrainingGesture or recognize functions (either of which may also 
					 * be overidden) depending on whether we're currently training a gesture or not.
					 * the time of the last hit.
					 */
					var gestureName = this.trainingGesture;

					if (gestureName) { this.saveTrainingGesture(gestureName, gesture);

					} else { this.recognize(gesture); }

					this.lastHit = new Date().getTime();
				};
			};
			
		}; // The frame listener is bound to the context of the LeapTrainer object

	 	/**
	 	 * This is the frame listening function, which will be called by the Leap.Controller on every frame.
	 	 */
		this.controller.on('frame', this.onFrame.bind(this)); 
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
	recordableFrame: function (frame, min) {

		var hands = frame.hands, j, hand, fingers, palmVelocity, tipVelocity;
		
		for (var i = 0, l = hands.length; i < l; i++) {
			
			hand = hands[i];

			palmVelocity = hand.palmVelocity;

			/*
			 * We return true if there is a hand moving above the minimum recording velocity
			 */
			if (Math.abs(Math.max(palmVelocity[0], palmVelocity[1], palmVelocity[2])) >= min) { return true; }
			
			fingers = hand.fingers;
			
			for (j = 0, k = fingers.length; j < k; j++) {

				tipVelocity = fingers[j].tipVelocity;

				/*
				 * Or if there's a finger tip moving above the minimum recording velocity
				 */
				if (Math.abs(Math.max(tipVelocity[0], tipVelocity[1], tipVelocity[2])) >= min) { return true; }
			};	
		};
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
		
		recordVector(frame.translation(lastFrame));
		recordVector(frame.rotationAxis(lastFrame));
		recordVector(frame.scaleFactor(lastFrame));
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

		if (typeof skipTraining == 'undefined' || !skipTraining) { this.startTraining(gestureName); }
	},

	/**
	 * This function sets the object-level trainingGesture variable. This modifies what happens when a gesture is detected 
	 * by determining whether we save it as a training gesture or attempting to recognize it.
	 * 
	 * This function fires the 'training-started' event.
	 * 
	 * @param gestureName
	 */
	startTraining: function(gestureName) { 
		
		this.trainingGesture = gestureName; 

		this.fire('training-started', gestureName);
	},

	/**
	 * For recognition algorithms that need a training operation after training data is gathered, but before the 
	 * gesture can be recognized, this function can be implemented and will be called in the 'saveTrainingGesture' function 
	 * below when training data has been collected for a new gesture.
	 * 
	 * @param gestureName
	 * @param trainingGestures
	 */
	trainAlgorithm: function (gestureName, trainingGestures) {},

	/**
	 * The saveTrainingGesture function records a single training gesture.  If the number of saved training gestures has reached 
	 * 'trainingGestures', the training is complete and the system switches back out of training mode.
	 * 
	 * This function fires the 'training-complete' and 'training-gesture-saved' events.
	 * 
	 * @param gestureName
	 * @param gesture
	 */
	saveTrainingGesture: function(gestureName, gesture) {
		
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
			this.fire('training-complete', gestureName, trainingGestures);

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
	 * the 'gesture-unknown' event, providing a numeric value for the closest match and the name of the closest
	 * known gesture as parameters to the event.
	 * 
	 * If a gesture is recognized, an event with the name of the gesture and no parameters will also be fired. So 
	 * listeners waiting for a 'Punch' gestures, for example, can just register for events using: 
	 * 
	 * 		trainer.on('Punch').
	 * 
	 * @param gesture
	 */
	recognize: function(gesture) {

		var gestures 			= this.gestures;
		var threshold			= this.hitThreshold;
		
		var hit					= 0;
		var bestHit				= 0;
		var recognized			= false;
		
		var closestGestureName	= null;
		
		/*
		 * We cycle through all known gestures
		 */
		for (var gestureName in gestures) {

			/*
			 * For each know gesture we generate a correlation value between the parameter gesture and a saved 
			 * set of training gestures. This correlation value is a numeric value between 0.0 and 1.0 describing how similar 
			 * this gesture is to the training set.
			 */
			hit = this.correlate(gestureName, gestures[gestureName], gesture);

			/*
			 * If the hit is equal to or greater than the configured hitThreshold, the gesture is considered a match.
			 */
			if (hit >= threshold) { recognized = true; }

			/*
			 * If the hit is higher than the best hit so far, this gesture is stored as the closest match.
			 */
			if (hit > bestHit) { bestHit = hit; closestGestureName = gestureName; }
		}

		this.fire(recognized ? 'gesture-recognized' : 'gesture-unknown', bestHit, closestGestureName);
		
		if (recognized) { this.fire(closestGestureName); }
	},

	/**
	 * This function accepts a set of training gestures and a newly input gesture and produces a number between 
	 * 0.0 and 1.0 describing how closely the input gesture resembles the set of training gestures.
	 * 
	 * This version implements uses a cross-correlation function (nicely described here http://paulbourke.net/miscellaneous/correlate/) to 
	 * identify an average level of similarity between the input gesture and the whole set of training gestures.
	 * 
	 * Alternative versions of this function have used Neural Networks trained on input gestures to produce correlation values, 
	 * but as of now, the algebraic cross-correlation is returning the best results!
	 * 
	 * @param gestureName
	 * @param trainingGestures
	 * @param gesture
	 * @returns {Number}
	 */
	correlate: function(gestureName, trainingGestures, gesture) {

		var correlation 		= 0;
		var correlationCount	= trainingGestures.length;
		
		var x = gesture, y, lx = x.length, ly, xi, yi, k, mx, my, sx, sy, sxy, d;
		
		/*
		 * Calculate mean over X
		 */
		mx = 0; for (var i = 0; i < lx; i++) { mx += x[i]; }; mx = mx / lx;		

		for (var i = 0, l = correlationCount; i < l; i++) {

			y = trainingGestures[i];

			ly = y.length;
			
			/*
			 * Calculate the mean over Y
			 */
			my = 0; for (var j = 0; j < ly; j++) { my += y[j]; }; my /= ly;		

			sx = 0;
			sy = 0;
			
			k = Math.max(lx, ly);
			
			for (var j = 0; j < k; j++) {
			   
				if (j < lx) { xi = x[j]; sx += (xi - mx) * (xi - mx); }
				if (j < ly) { yi = y[j]; sy += (yi - my) * (yi - my); }
			}

			/*
			 * Calculate the denominator
			 */
			d = Math.sqrt(sx * sy);

			sxy = 0;
			
			for (var j = 0; j < k; j++) { if (j < lx && j < ly) { sxy += (x[j] - mx) * (y[j] - my); } }
			
			correlation += sxy/d;
		}

		return correlation/correlationCount;
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
	getFrameRecordingStrategy : function() { return 'Low-Resolution'; },
	
	/**
	 * This is the name of the mechanism used to recognize learned gestures.
	 */
	getRecognitionStrategy : function() { return 'Cross-Correlation'; },
	
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
		
		if (gesture) { return JSON.stringify({name: gestureName, data: gesture}); }
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
		
		return imp;
	},

	/**
	 * This is a standard event registration event - paired with the fire event below, it provides an event-oriented 
	 * mechanism for notifying external components when significant events happen - gestures being matching, training 
	 * cycles starting and ending, etc.
	 * 
	 * @param event
	 * @param listener
	 */
	on: function(event, listener) {
		
		var listening = this.listeners[event];
		
		if (!listening) { listening = []; }
		
		listening.push(listener);
		
		this.listeners[event] = listening;
	},
	
	/**
	 * This function removes an event listener previously bound using the on() function above.
	 * 
	 * @param event
	 * @param listener
	 */
	off: function(event, listener) {
		
		if (!event) { return; }
		
		var listening = this.listeners[event];
		
		if (listening) { 
			
			listening.splice(listening.indexOf(listener), 1);
			
			this.listeners[event] = listening;
		}
	},
	
	/**
	 * This function is called in various function above in order to notify listening components when the events they're 
	 * registered to hear occur.
	 * 
	 * This function accepts an arbitrary number of arguments, all of which will be passed on to listening functions except the 
	 * first (so not quite arbitrary.. (arbitrary + 1)), which is the name of the event being fired.
	 * 
	 * @param event
	 */
	fire: function(event) {
		
		var listening = this.listeners[event];
		
		if (listening) { 
			
			var args = Array.prototype.slice.call(arguments);

			args.shift();

			for (var i = 0, l = listening.length; i < l; i++) { listening[i].apply(this, args); }
		}
	},

	/**
	 * This function temporarily disables frame monitoring.
	 */
	pause: function() { this.paused = true; },
	
	/**
	 * This function resumes paused frame monitoring.
	 */
	resume: function() { this.paused = false; },
	
	/**
	 * This function unbinds the controller from the leap frame event cycle - making it inactive and ready 
	 * for cleanup.
	 */
	destroy: function() { this.controller.removeListener('frame', this.onFrame); }
});