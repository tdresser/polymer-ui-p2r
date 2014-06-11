// TODO: remove the one frame stutter when flinging in.
// TODO: don't redraw so much.

// Using a constant timestep for now.
var TIMESTEP = 16;

function Overscroll(max_offset) {
  // Constants to configure spring physics
  this.SPRING_CONSTANT = 0.0003;
  this.DAMPING = 0.5;
  this.SPRING_LERP_POW = 4;
  this.FRICTION = 0.95;

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

    delta = delta / max_offset;
    return max_offset * delta / (1 + delta);
  }

  this.reachedTarget = function() {
    return Math.abs(d - target) < 1 && v === 0;
  }

  this.step = function(time) {
    if (target === null && v === 0) {
      return false;
    }

    var current_distance = d;

    var target_pos = target === null ? 0 : target;
    var delta = time - prev_time;

    // If we don't have information on elapsed time, assume it's been 30 ms
    // since the last update.
    if (prev_time === 0) {
      delta = TIMESTEP;
    }

    prev_time = time;
    if (fling_time !== null) {
      fling_time += delta;
    }

    var lerp = 1;
    if (fling_time !== null && fling_time < 500) {
      lerp = fling_time / 500;
    }

    var a = Math.pow(lerp, this.SPRING_LERP_POW) *
        (this.SPRING_CONSTANT * (target - d));
    v *= this.FRICTION;
    v += a * delta;
    // Using the velocity after applying the acceleration due to the spring
    // keeps the simulation more stable.
    var dampening = Math.pow(lerp, this.SPRING_LERP_POW) * this.DAMPING * v;
    v -= dampening;
    d += v * delta;

    if (target_pos - d > -0.1 && v <= 0) {
      v = 0;
      d = target;
      target = null;
      prev_time = 0;
    }

    return d !== current_distance;
  }

  this.setOffset = function(o) {
    fling_time = Number.MAX_VALUE;
    prev_time = 0;
    target = null;
    d = o;
    v = 0;
  }

  this.getOffset = function() {
    return d;
  }
}

// Performs an ordinary least squares regression.
function VelocityCalculator(bufferSize) {
  var y_buffer = new Array(bufferSize);
  var t_buffer = new Array(bufferSize);
  var index = 0;

  // We do this frequently, so keep it light. Delay as much computation as
  // possible until |getVelocity| is called.
  this.addValue = function(y, t) {
    y_buffer[index] = y;
    t_buffer[index] = t;
    index = (index + 1) % bufferSize;
  }

  this.getVelocity = function() {
    var y_sum = 0;
    var t_sum = 0;

    for (var i = 0; i < bufferSize; ++i) {
      y_sum += y_buffer[i];
      t_sum += t_buffer[i];

      console.log(t_buffer[i] + ", " + y_buffer[i]);
    }

    var y_mean = y_sum / bufferSize;
    var t_mean = t_sum / bufferSize;

    var sum_yt = 0;
    var sum_tt = 0;

    for (var i = 0; i < bufferSize; ++i) {
      var t_i = (t_buffer[i] - t_mean);
      sum_yt += (y_buffer[i] - y_mean) * t_i;
      sum_tt += t_i * t_i;
    }

    console.log(sum_yt / sum_tt);
    return sum_yt / sum_tt;
  }

  this.getLastDeltas = function() {
    var y1 = y_buffer[(index - 3) % bufferSize];
    var y2 = y_buffer[(index - 2) % bufferSize];
    var y3 = y_buffer[(index - 1) % bufferSize];
    return [y2 - y1, y3 - y2];
  }
}


Polymer('polymer-p2r', {
  ready: function() {
    var self = this;
    var p2r = self.$.p2r;
    var scroller = document.body;
    var scrollcontent = self.$.scrollcontent;
    var pullStartY = 0;
    var loadingOffset = 150;
    var fingersDown = 0;

    var overscroll = new Overscroll(window.innerHeight);
    var isFirstTouchMove = false;
    var frame = 0;

    // expose for access via developer console.
    window.scroller = scroller;
    window.overscroll = overscroll;
    window.polymer_element = this;

    var velocityCalculator = new VelocityCalculator(5);

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

    var time = 0;
    function onAnimationFrame() {
      // Use a hard coded delta for now, as Euler integration behaves badly when
      // given timestamps which vary as much as the RAF timestamps do.
      // TODO: integrate better (RK4? Do more Euler integration steps, with a
      // fixed timestep, and interpolate between them?)
      time += TIMESTEP;

      // TODO - figure out if we can ever not schedule an update.
      requestAnimationFrame(onAnimationFrame);
      velocityCalculator.addValue(scroller.scrollTop, time);

      if (!overscroll.step(time) && overscroll.getOffset() == 0) {
        return;
      }

      if (overscroll.getOffset() < 0) {
        scroller.scrollTop = -overscroll.getOffset();
        overscroll.setOffset(0);
      } else if (scroller.scrollTop !== 0 && overscroll.getOffset() > 0) {
        console.log("Repair offset required ");
      }

      var offset = overscroll.addFriction(overscroll.getOffset());
      var clientHeight = p2r.clientHeight;

      checkPulled();
      translateY(scrollcontent, offset);
      translateY(p2r, offset - clientHeight);
      frame++;
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
    }

    function finishLoading() {
      setHeaderClassName('');
      if (isP2rVisible() && fingersDown == 0) {
        overscroll.setTarget(Math.max(0, scroller.scrollTop));
      }
    }

    scroller.addEventListener('touchstart', function(e) {
      fingersDown++;
      isFirstTouchMove = true;
      overscroll.setOffset(overscroll.getOffset());
    });

    scroller.addEventListener('touchmove', function(e) {
      if (!e.cancelable) {
        return;
      }

      console.log("touchmove " + e.touches[0].clientY);
      console.log("scrollTop " + scroller.scrollTop);
      console.log("overscroll offset " + overscroll.getOffset());

      if (isFirstTouchMove) {
        pullStartY = e.touches[0].clientY + scroller.scrollTop - overscroll.getOffset();
        console.log("pullStartY (first) " + pullStartY);
        isFirstTouchMove = false;
        if (isPulling()) {
          console.log("prevent first touchmove");
          e.preventDefault();
        } else {
          console.log("don't prevent first touchmove");
        }
        return;
      }

      var offset = e.touches[0].clientY - pullStartY;

      if(!isPulling() && offset <= 0) {
        // TODO: this is an ugly hack, to deal with the way that the scroll
        // offset gets out of sync with |offset|.
        pullStartY = e.touches[0].clientY + scroller.scrollTop - overscroll.getOffset();
        console.log("pullStartY " + pullStartY);
        return;
      }

      if (offset > 0) {
        e.preventDefault();
      }

      if (scroller.scrollTop == 0 &&
          overscroll.getOffset() == 0 &&
          velocityCalculator.getLastDeltas()[1] !== 0) {
        // We may have a truncated delta, which will be handled in
        // transitionIntoJavascriptScrollIfNecessary.
        return;
      }
      console.log("setOffset " + offset);
      overscroll.setOffset(offset);
    });

    function transitionIntoJavascriptScrollIfNecessary() {
      if(isPulling() || scroller.scrollTop > 0) {
        return;
      }

      var lastDeltas = velocityCalculator.getLastDeltas();
      var truncatedScrollDelta = lastDeltas[1] - lastDeltas[0];

      if(Math.abs(lastDeltas[0]) > Math.abs(lastDeltas[1])) {
        // Looks like truncation occurred.
        overscroll.setOffset(overscroll.getOffset() + truncatedScrollDelta);
      }

      if (fingersDown == 0) {
        var vel = -velocityCalculator.getVelocity() * 0.9;
        overscroll.setTarget(0);
        overscroll.setVelocity(vel);
      }
    }

    window.addEventListener('scroll', transitionIntoJavascriptScrollIfNecessary);
    scroller.addEventListener('touchcancel', finishPull);
    scroller.addEventListener('touchend', finishPull);

    document.addEventListener('scroll', function() {
      // Make 100% sure chrome knows we have a scroll listener.
    });
    requestAnimationFrame(onAnimationFrame);
  }
});
