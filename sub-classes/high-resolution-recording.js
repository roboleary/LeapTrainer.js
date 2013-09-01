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

LeapTrainer.HRController = LeapTrainer.Controller.extend({

	hitThreshold: 0.3, // Since the data recorded in this implementation is very detailed, the hit threshold is relatively low
	
	/**
	 * 
	 */
	getFrameRecordingStrategy : function() { return 'High-Resolution'; },

	/**
	 * 
	 * @param frame
	 * @param lastFrame
	 * @param recordVector
	 * @param recordValue
	 */
	recordFrame: function(frame, lastFrame, recordVector, recordValue) {

		var compare 	= function (obj1, obj2, vectorName) {

			var v1 = obj1[vectorName], v2 = obj2[vectorName];
			
			return v1[0] - v2[0] || v1[1] - v2[1] || v1[2] - v2[2];
		};

		var hands		= frame.hands;
		var handCount 	= hands.length;

		if (handCount > 1) {

			hands.sort(function(h1, h2) { return  compare(h1, h2, 'palmNormal') || compare(h1, h2, 'direction') || compare(h1, h2, 'palmVelocity'); });		
		}

		var hand, finger, fingers, fingerCount;
		
		for (var i = 0, l = handCount; i < l; i++) {
			
			hand = hands[i];

			recordVector(hand.palmVelocity);
			recordVector(hand.palmNormal);
			recordVector(hand.direction);

			fingers 	= hand.fingers;
			fingerCount = fingers.length;

			if (fingerCount > 1) { fingers.sort(function(f1, f2) { return  compare(f1, f2, 'tipVelocity') || compare(f1, f2, 'direction'); }); }

			for (var j = 0, k = fingerCount; j < k; j++) {
				
				finger = fingers[j];

				recordVector(finger.tipVelocity);
				recordVector(finger.direction);
			};
		};
	}	
});