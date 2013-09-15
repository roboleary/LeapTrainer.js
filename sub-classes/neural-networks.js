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

LeapTrainer.ANNController = LeapTrainer.Controller.extend({

	trainingErrorThreshold	: 0.0001,
	trainingIterations		: 20000,
	learningRate			: 0.2,
	gestureHitThreshold		: 0.95,
	
	gestureNets				: {},

	/**
	 * 
	 * @returns {String}
	 */
	getRecognitionStrategy : function() { return 'Artificial Neural Networks'; },

	/**
	 * 
	 * @param gestureName
	 */
	create: function(gestureName) { 

		this._super(gestureName);
		
		this.gestureNets[gestureName] = new brain.NeuralNetwork({learningRate: this.learningRate}); 
	},	
	
	/**
	 * 
	 * @param gestureName
	 * @param trainingGestures
	 */
	trainAlgorithm: function (gestureName, trainingGestures) {

		var trainingData = trainingGestures.slice(0);

		/*
		 * ANNs require uniform input - at least, the brain.js implementation does - so we truncate all training data arrays to the 
		 * length of the shortest one. 
		 * 
		 * This is pretty much a hack - one better way to do it would be to normalize input across a vector of fixed length.
		 */
		var shortestInput = Number.POSITIVE_INFINITY, inputLength;
		
		for (var i = 0, l = trainingData.length; i < l; i++) {

			inputLength = trainingData[i].length;

			if (inputLength > 0 && inputLength < shortestInput) { shortestInput = inputLength - 1; }
		}

		for (var i = 0, l = trainingData.length; i < l; i++) { trainingData[i] = {input: trainingData[i].slice(0, shortestInput), output: [1.0]}; }

		/*
		 * Next we pad out the training data with an equal quantity of nonsense data.  This doesn't make much sense - or rather, it kind of 
		 * does, but it shouldn't be necessary.  The random data is mapped to 0.0, while the good gestures map to 1.0.
		 */
		var nonsenseGestureActivity;

		for (var i = 0, l = trainingData.length * 2; i < l; i++) {

			nonsenseGestureActivity = [shortestInput];

			for (var j = 0; j < shortestInput; j++) { nonsenseGestureActivity[j] = (Math.floor(Math.random()*(100 - 1 + 1) + 1)/100.0); }

			trainingData.push({input: nonsenseGestureActivity, output: [0]});
		}
		
		/*
		 * Now we train the ANN with the normalized training data
		 */
		this.gestureNets[gestureName].train(trainingData, {errorThresh: this.trainingErrorThreshold, iterations: this.trainingIterations});
	},

	/**
	 * 
	 * @param gestureName
	 * @param trainingGestures
	 * @param gesture
	 * @returns
	 */
	correlate: function(gestureName, trainingGestures, gesture) {

		var network = this.gestureNets[gestureName];
		
		if (network == null) { return 0.0; }

		return network.run(gesture)[0];
	},
	
	/**
	 * This controller exports and imports trained networks along with the training data.
	 * 
	 * @param gestureName
	 * @returns {String}
	 */
	toJSON: function(gestureName) { 
	
		var gesture = this.gestures[gestureName];
		
		if (gesture) { return JSON.stringify({name: gestureName, data: gesture, net: this.gestureNets[gestureName].toJSON()}); }
	},
	
	/**
	 * This import is compatible only with exports from the toJSON function above.
	 * 
	 * @param json
	 */
	fromJSON: function(json) {

		var imp = this._super(json);

		this.gestureNets[imp.name].fromJSON(imp.net);
	}
});