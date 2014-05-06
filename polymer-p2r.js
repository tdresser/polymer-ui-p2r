// TODO: remove the one frame stutter when flinging in.
// TODO: don't allow flinging past the bottom of the page when the header is up.
// TODO: don't redraw so much.

function Overscroll() {
  this.MAX_OFFSET = 800;

  // Constants to configure spring physics
  this.SPRING_CONSTANT = 0.0003;
  this.DAMPING = 0.5;
  this.SPRING_LERP_POW = 4;

  var self = this;
  var d = 0;
  var v = 0;
  var target = null;
  var prev_time = 0;

  // Time since last fling, or null if not in fling.
  var fling_time = null;

  // Only used for tweaking via developer console.
  this.setParms = function(k, b) {
    this.SPRING_CONSTANT = k;
    this.DAMPING = b;
  }

  this.setTarget = function(t) {
    target = t;
    v = 0;
    fling_time = null;
    prev_time = 0;
  }

  this.setVelocity = function(vel) {
    fling_time = 0;
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
    return 2 * this.MAX_OFFSET * (delta/2 - Math.pow(delta/2, 1.5));
  }

  this.reachedTarget = function() {
    return Math.abs(d - target) < 1 && v === 0;
  }

  this.step = function(time) {
    if (target === null && v === 0) {
      return;
    }

    var target_pos = target === null ? 0 : target;

    // Use a hard coded delta for now, as Euler integration behaves badly when
    // given timestamps which vary as much as the RAF timestamps due.
    // TODO: integrate better (RK4? Do more Euler integration steps, with a
    // fixed timestep, and interpolate between them?)
    var delta = 16;//time - prev_time;

    // If we don't have information on elapsed time, assume it's been 30 ms
    // since the last update.
    if (prev_time === 0) {
      delta = 30;
    }

    prev_time = time;
    if (fling_time !== null) {
      fling_time += delta;
    }

    if (d > this.MAX_OFFSET) {
      d = this.MAX_OFFSET;
      v = 0;
    }

    var lerp = 1;
    if (fling_time !== null && fling_time < 500) {
      lerp = fling_time / 500;
    }

    var a = Math.pow(lerp, this.SPRING_LERP_POW) *
        (this.SPRING_CONSTANT * (target - d));
    v += a * delta;
    // Using the velocity after applying the acceleration due to the spring
    // keeps the simulation more stable.
    var dampening = Math.pow(lerp, this.SPRING_LERP_POW) * this.DAMPING * v;
    v -= dampening;
    d += v * delta;

    if (target_pos - d > -1 && v <= 0) {
      v = 0;
      d = target;
      target = null;
      prev_time = 0;
    }
  }

  this.setOffset = function(o) {
    console.log("SET OFFSET TO " + o);
    fling_time = Number.MAX_VALUE;
    prev_time = 0;
    target = null;
    d = o;
    v = 0;
//    this.step(0);// TODO - this should be removed.
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

  this.getLastDeltas = function() {
    if (y_buffer.length < 3) {
      return [0,0];
    }
    var l = y_buffer.length;
    var y1 = y_buffer[l - 3];
    var y2 = y_buffer[l - 2];
    var y3 = y_buffer[l - 1];
    return [y2 - y1, y3 - y2];
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
    var loadingOffset = 150;
    var fingersDown = 0;
    var overscroll = new Overscroll();
    var isFirstTouchMove = false;

    // expose for access via developer console.
    window.overscroll = overscroll;
    window.FLING_VELOCITY_MULTIPLIER = 1;
    window.polymer_element = this;

    var velocityCalculator = new VelocityCalculator(3);

    function getHeaderClassName() {
      return self.className;
    }

    function setHeaderClassName(name) {
      self.className = name;
    }

    function translateY(element, offset) {
      element.style.webkitTransform = 'translate3d(0, ' + offset + 'px, 0)';
    }

    function checkPulled() {
      if (fingersDown === 0) {
        return;
      }
      var triggerOffset = 60;
      if (getHeaderClassName() != 'loading') {
        setHeaderClassName(overscroll.getOffset() > triggerOffset ? 'pulled' : '');
      }
    }

    var lastTime = 0;
    function onAnimationFrame(time) {
      // TODO - figure out if we can ever not schedule an update.
      framePending = false;
      scheduleUpdate();

      // TODO - we shouldn't really need to add the pile of zero's during overscroll.
      velocityCalculator.addValue(scroller.scrollTop, time);

//      sampleScrollOffset();

      checkPulled();
      overscroll.step(time);

      if (overscroll.getOffset() < 0) {
        console.log("Repair offset " + overscroll.getOffset());
        console.log("EXISTING SCROLL TOP OF " + scroller.scrollTop);
        scroller.scrollTop = -overscroll.getOffset();
        overscroll.setOffset(0);
      } else if (scroller.scrollTop !== 0 && overscroll.getOffset() > 0) {
        console.log("Repair offset required ");
      }

      translateY(scrollcontent, overscroll.addFriction(overscroll.getOffset()));
      translateY(p2r, overscroll.addFriction(overscroll.getOffset()) - p2r.clientHeight);

      if (scroller.scrollTop === 0 && overscroll.getOffset() === 0) {
        console.log("ZEROED");
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
      return overscroll.getOffset() > 0;
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
      fingersDown++;
      isFirstTouchMove = true;
      overscroll.setOffset(overscroll.getOffset());
    });

    scroller.addEventListener('touchmove', function(e) {
      if (isFirstTouchMove) {
        pullStartY = e.touches[0].screenY + scroller.scrollTop - overscroll.getOffset();
        isFirstTouchMove = false;
        if (isPulling()) {
          console.log("PREVENT");
          e.preventDefault();
        }
        return;
      }

      var offset = e.touches[0].screenY - pullStartY;

      if(!isPulling() && offset <= 0) {
        // TODO: this is an ugly hack, to deal with the way that the scroll
        // offset gets out of sync with |offset|.
        pullStartY = e.touches[0].screenY + scroller.scrollTop - overscroll.getOffset();
        console.log("BAIL");
        return;
      }

      if (offset > 0) {
        e.preventDefault();
      }

      if (scroller.scrollTop == 0 &&
          overscroll.getOffset() == 0 &&
          velocityCalculator.getLastDeltas()[1] !== 0) {
        console.log("SKIP SET OFFSET " + velocityCalculator.getLastDeltas());
        // We may have a truncated delta, which will be handled in sampleScrollOffset.
        return;
      }
      console.log("TOUCH MOVE SET OFFSET");
      overscroll.setOffset(offset);
    });

    function transitionIntoJavascriptScrollIfNecessary() {
      if(isPulling() || scroller.scrollTop > 0) {
        return;
      }

      console.log("LAST DELTA OF " + velocityCalculator.getLastDeltas()[1]);

      var lastDeltas = velocityCalculator.getLastDeltas();
      var truncatedScrollDelta = lastDeltas[1] - lastDeltas[0];
      console.log("NEED TO ADVANCE HERE " + lastDeltas[0] + " " + lastDeltas[1]);

      if(Math.abs(lastDeltas[0]) > Math.abs(lastDeltas[1])) {
        // Looks like truncation occurred.
        console.log("TRUNCATED BY " + truncatedScrollDelta);
        overscroll.setOffset(overscroll.getOffset() + truncatedScrollDelta);
      } else {
        console.log("NO TRUNCATION");
      }

      if (fingersDown == 0) {
        var vel = -velocityCalculator.getVelocity() * window.FLING_VELOCITY_MULTIPLIER;
        console.log("FLING " + vel)
        overscroll.setTarget(0);
        overscroll.setVelocity(vel);
      }
    }

    scroller.addEventListener('scroll', transitionIntoJavascriptScrollIfNecessary);
    scroller.addEventListener('touchcancel', finishPull);
    scroller.addEventListener('touchend', finishPull);

    document.addEventListener('scroll', function() {
      // Make 100% sure chrome knows we have a scroll listener.
    });
    scheduleUpdate();
  }
});
