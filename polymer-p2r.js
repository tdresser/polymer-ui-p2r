function Overscroll() {
  this.MAX_OFFSET = 400;
  var self = this;
  var d = 0;
  var v = 0;
  var base_a = 10;
  var target = null;
  var step = 1;
  var prev_time = 0;
  var friction = 0.9;

  this.setTarget = function(t) {
    target = t;
  }

  this.addFriction = function(delta) {
    if (delta < 0) {
      return delta;
    }

    delta = delta/this.MAX_OFFSET;
    if (delta > 1) {
      delta = 1;
    }
    return this.MAX_OFFSET * (delta/2 - delta/2 * delta/2);
  }

  this.reachedTarget = function() {
    if (Math.abs(d - target) < 1) {
      return true;
    }
  }

  this.step = function(time) {
    var delta = time - prev_time;
    prev_time = time;

    if (d > this.MAX_OFFSET) {
      d = this.MAX_OFFSET;
    }

    if (target === null) {
      return;
    }

    if (Math.abs(target - d) < 1) {
      d = target;
      target = null;
    } else {
      var a = Math.abs(base_a * (target - d)/10.0);
      v += (a * delta) * friction;
      d += v * delta;
//      d += (target - d)/10.0;
      console.log("t " + delta);
      console.log("a " + a);
      console.log("v " + v);
      console.log("d " + d);

    }
  }

  this.setOffset = function(o) {
    target = null;
    d = o;
    this.step(0);
  }

  this.getOffset = function() {
    return d;
  }
}

// Performs an ordinary least squares regression.
function VelocityCalculator(bufferSize) {
  var y_buffer = [];
  var t_buffer = [];

  var y_sum = 0;
  var t_sum = 0;

  this.addValue = function(y, t) {
    y_buffer.push(y);
    y_sum += y;
    t_buffer.push(t);
    t_sum += t;

    if (y_buffer.length > bufferSize) {
      y_sum -= y_buffer.shift();
      t_sum -= t_buffer.shift();
    }
  }

  this.getVelocity = function() {
    if (y_buffer.length < bufferSize) {
      return 0;
    }

    var y_mean = y_sum / bufferSize;
    var t_mean = t_sum / bufferSize;

    var sum_yt = 0;
    var sum_tt = 0;

    for (var i = 0; i < bufferSize; ++i) {
      sum_yt += (y_buffer[i] - y_mean) * (t_buffer[i] - t_mean);
      sum_tt += (t_buffer[i] - t_mean) * (t_buffer[i] - t_mean);
    }

    return sum_yt / sum_tt;
  }
}


Polymer('polymer-p2r', {
  ready: function() {
    var self = this;
    var scroller = self.$.scroller;
    var p2r = self.$.p2r;
    var scrollcontent = self.$.scrollcontent;
    var framePending = false;
    var pullStartY = 0;
    var lastY = 0;
    var loadingOffset = 150;
    var fingersDown = 0;
    var overscroll = new Overscroll();
    var absorbNextTouchMove = false;
    var velocityCalculator = new VelocityCalculator(5);


    function getHeaderClassName(name) {
      return self.className;
    }

    function setHeaderClassName(name) {
      self.className = name;
    }

    function translateY(element, offset) {
      element.style.webkitTransform = 'translate3d(0, ' + offset + 'px, 0)';
    }

    function checkPulled() {
      var triggerOffset = 60;
      if (getHeaderClassName() != 'loading') {
        setHeaderClassName(overscroll.getOffset() > triggerOffset ? 'pulled' : '');
      }
    }

    function onAnimationFrame(time) {
      framePending = false;
      checkPulled();
      overscroll.step(time);

//      console.log("offset is " + overscroll.getOffset());
//      console.log("scroll top is " + scroller.scrollTop);

      if (overscroll.getOffset() <= 0) {
        console.log("SWITCH OUT");
        scroller.scrollTop = -overscroll.getOffset();
        overscroll.setOffset(0);
      }
      translateY(scrollcontent, overscroll.addFriction(overscroll.getOffset()));
      translateY(p2r, overscroll.addFriction(overscroll.getOffset()) - p2r.clientHeight);
      if (!overscroll.reachedTarget()) {
        scheduleUpdate();
      }
    }

    function scheduleUpdate() {
      if (!framePending) {
        framePending = true;
        requestAnimationFrame(onAnimationFrame);
      }
    }


    function isP2rVisible() {
      return scroller.scrollTop <= overscroll.getOffset();
    }

    function isPulling() {
      return overscroll.getOffset() > 0.2;
    }

    function finishPull(e) {
      fingersDown--;

      if (!isPulling() || fingersDown != 0 || !isP2rVisible()) {
        return;
      }

      if (getHeaderClassName() == 'pulled') {
        setHeaderClassName('loading');
        setTimeout(finishLoading, 2000);
        overscroll.setTarget(loadingOffset);
      } else {
        overscroll.setTarget(Math.max(0, scroller.scrollTop));
      }
      scheduleUpdate();
    }

    function finishLoading() {
      setHeaderClassName('');
      if (isP2rVisible() && fingersDown == 0) {
        overscroll.setTarget(Math.max(0, scroller.scrollTop));
        scheduleUpdate();
      }
    }

    scroller.addEventListener('touchstart', function(e) {
      lastY = e.touches[0].screenY + scroller.scrollTop;
      pullStartY = lastY;
      fingersDown++;

      if (isPulling()) {
        absorbNextTouchMove = true;
      }
    });

    scroller.addEventListener('touchmove', function(e) {
      if (absorbNextTouchMove) {
        pullStartY = e.touches[0].screenY - overscroll.getOffset();
        absorbNextTouchMove = false;
        e.preventDefault();
        return;
      }

      var scrollDelta = lastY - e.touches[0].screenY;
      var startingNewPull = !isPulling() && scroller.scrollTop <= 0 && scrollDelta < 0;
      lastY = e.touches[0].screenY;

      var offset = e.touches[0].screenY - pullStartY;

      if(!startingNewPull && !isPulling()) {
        return;
      }

      if (offset > 0) {
        e.preventDefault();
      }

      overscroll.setOffset(offset);
      scheduleUpdate();
    });

    function onScrollEvent(e) {
      frame++;
      velocityCalculator.addValue(scroller.scrollTop, window.performance.now());

      var vel = velocityCalculator.getVelocity();
      vel = Math.max(-2.5, vel);

      // The higher the velocity, the longer the animation should be. We solve
      // for the duration of the animation based on the kinematic equations,
      // using a made up acceleration that feels about right. Note that since
      // the animation path isn't a parabola, this isn't quite correct.
      var acceleration = 10;
      var duration = (-vel + Math.sqrt(vel*vel)) / acceleration;
      var distance = -vel * (duration/2.0) +
          0.5 * acceleration * (duration/2.0) * (duration/2.0);
      distance *= 100;

      if (distance < 10 || scroller.scrollTop > 10) {
        return;
      }

      if (fingersDown == 0 && !inFlingAnimation) {
        // TODO - do fling.
      }
    }

    scroller.addEventListener('scroll', onScrollEvent);
    scroller.addEventListener('touchcancel', finishPull);
    scroller.addEventListener('touchend', finishPull);
  }
});
