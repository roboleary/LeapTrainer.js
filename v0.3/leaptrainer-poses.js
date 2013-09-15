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

/*
 * This is an experimental feature - NOT quite working in the form below, but not so bad.
 * 
 * When a gesture is detected we start monitoring. If subsequent frames differ less than a given amount from the 
 * the last frame in the gesture, then the user must be holding his or her hand in position at the end of the 
 * gesture - this is a pose. 
 * 
 * Adding this feature should cause two new events to be emit.
 *
 * trainer.on('holding-pose', function(gestureName) {  });	
 *
 * trainer.on('released-pose', function(gestureName) {  });* 
 */

/**
 * 
 */
LeapTrainer.PoseController = LeapTrainer.Controller.extend({

	pose					: [],
	prePose					: [],
	poseName				: null,
	firedPoseEvent			: false,
	poseThresholdRatio		: 0.73,

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
		var recording = false, frameCount = 0, gesture = [], poseFrame = [];

		/*
		 * These two utility functions are used to push a vector (a 3-variable array of numbers) into the gesture array - which is the 
		 * array used to store activity in a gesture during recording. NaNs are replaced with 0.0, though they shouldn't occur!
		 */
	 	recordValue		 = function (val) 	{ gesture.push(isNaN(val) ? 0.0 : val); },
	 	recordPoseValue	 = function (val) 	{ poseFrame.push(isNaN(val) ? 0.0 : val); },
	 	
	 	recordVector	 = function (v) 	{ recordValue(v[0]); recordValue(v[1]); recordValue(v[2]); };
	 	recordPoseVector = function (v) 	{ recordPoseValue(v[0]); recordPoseValue(v[1]); recordPoseValue(v[2]); };

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
		
	 		if (this.pose.length > 0) {
		
				poseFrame = [];

				this.recordFrame(frame, this.prePose, recordPoseVector, recordPoseValue);

				var poseHit = this.correlate(this.poseName, [this.preparePoseFrame(poseFrame)], this.pose);

				if (poseHit > (this.hitThreshold * this.poseThresholdRatio)) {

					if (!this.firedPoseEvent) {  
	
						this.firedPoseEvent = true;
						
						this.fire('holding-pose', this.poseName);
					}

				} else {

					this.lastHit = new Date().getTime();
					
					this.firedPoseEvent = false;
					
					this.pose.length = 0;
					
					this.fire('released-pose', this.poseName);
				}
			}
		
	 	
	 		//From here the function is the same as the super-class - so some refactoring will be necessary in order to insert the above.
	 	
	 	}
	},
	
	/**
	 * TODO
	 */
	preparePoseFrame: function(frame) { return frame; /*return this.process(frame);*/ },	
	
	recognize: function(gesture, frameCount) {
	
		//This function is the same as the superclass, except after this line:  if (recognized) { 

		this.pose.length = 0;

		this.pose = this.pose.concat(gesture.slice(gesture.length - (gesture.length/frameCount))); 

		this.prePose = this.controller.frame(1);

		this.poseName = closestGestureName;
	}	

});





