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
 * 
 */
LeapTrainer.CorrelationController = LeapTrainer.Controller.extend({

	trainingGestures	: 3,
	hitThreshold		: 0.6,
	convolutionFactor	: 5,
	
	/**
	 * 
	 */
	getFrameRecordingStrategy : function() { return 'Low-Resolution'; },
	
	/**
	 * 
	 * @returns {String}
	 */
	getRecognitionStrategy : function() { return 'Cross-Correlation'; },

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
	 * TODO
	 */
	preparePoseFrame: function(frame) { return frame; },

	/**
	 * 
	 * @param gesture
	 * @returns
	 */
	process: function(gesture) { },

	/**
	 * 
	 * @param gestureName
	 * @param trainingGestures
	 */
	trainAlgorithm: function (gestureName, trainingGestures) {},

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
	}
});





