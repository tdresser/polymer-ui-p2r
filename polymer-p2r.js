function Overscroll() {
  // Constants for tuning physics.
  this.MAX_OFFSET = 400;
//  this.GRAVITY = -0.18;
  this.GRAVITY = -0.15;
  this.FRICTION = 0.93;
  this.SPRING_SCALE = 50;
  this.SPRING_FORCE = 0.96;

  var self = this;
  var d = 0;
  var v = 0;
  var target = null;
  var prev_time = 0;

  // Only used for tweaking via developer console.
  this.setParms = function(g, f, s, x) {
    this.GRAVITY = g;
    this.FRICTION = f;
    this.SPRING_SCALE = s;
    this.SPRING_FORCE = x;
  }

  this.setTarget = function(t) {
    console.log("setTarget");
    target = t;
    v = 0;
  }

  this.setVelocity = function(vel) {
    v = vel;
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
    return Math.abs(d - target) < 1 && v === 0;
  }

  this.step = function(time) {
    if (target === null && v === 0) {
      return;
    }

    var target_pos = target === null ? 0 : target;

    var delta = time - prev_time;
    // If we don't have information on elapsed time, assume it's been 16 ms
    // since the last update.
    if (prev_time === 0) {
      delta = 16;
    }

    prev_time = time;

    if (d > this.MAX_OFFSET) {
      d = this.MAX_OFFSET;
    }

    var dist_to_target = (target - d) / this.SPRING_SCALE;
    var spring = -this.SPRING_FORCE * this.GRAVITY *
        (1 / (dist_to_target * dist_to_target + 1));

    var a = 0;
    if (v < 0) {
      a += spring;
    }
    a += this.GRAVITY;
    v += a * delta;

    if (v < 0) {
      v *= Math.pow(this.FRICTION, delta);
    }
    d += v * delta;

//    console.log("GRAVITY " + this.GRAVITY);
//    console.log("spring " + spring);
//    console.log("a " + a);
//    console.log("v " + v);
//    console.log("d " + d);
//    console.log("dist_to_target " + dist_to_target);

    if (target_pos - d > -1 && v <= 0) {
      console.log("reset");
      v = 0;
      d = target;
      target = null;
      prev_time = 0;
    }
  }

  this.setOffset = function(o) {
    target = null;
    d = o;
    v = 0;
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

    // expose for access via developer console.
    window.overscroll = overscroll;
    window.FLING_VELOCITY_MULTIPLIER = 3;

    var absorbNextTouchMove = false;
    var velocityCalculator = new VelocityCalculator(3);

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

      if (overscroll.getOffset() <= 0) {
        scroller.scrollTop = -overscroll.getOffset();
        console.log("Realign due to broken scrollTop");
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
      velocityCalculator.addValue(scroller.scrollTop, window.performance.now());

      var vel = -velocityCalculator.getVelocity() * window.FLING_VELOCITY_MULTIPLIER;

      if (scroller.scrollTop > 10) {
        console.log("Abort fling");
        return;
      }

      if (fingersDown == 0) {
        console.log("FLING " + vel)
        overscroll.setTarget(0);
        overscroll.setVelocity(vel);
        scheduleUpdate();
      }
    }

    scroller.addEventListener('scroll', onScrollEvent);
    scroller.addEventListener('touchcancel', finishPull);
    scroller.addEventListener('touchend', finishPull);
  }
});
