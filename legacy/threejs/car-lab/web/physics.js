// Fahrmodell des Showrooms. Absichtlich klein: Einspurmodell in der Ebene,
// Aufbau mit drei Freiheitsgraden (Hub, Nicken, Wanken) auf vier Feder-Dämpfern.
// Die Radlasten kommen aus den Federn — Lastwechsel, Wanken und Springen
// entstehen daraus von selbst, nicht aus einer eigenen Regel.
//
// Koordinaten wie im glTF: Y oben, vorwärts = +Z, links = +X.
// Der Zustand wird in Weltkoordinaten integriert (nicht im mitdrehenden
// Fahrzeugsystem) — CLAUDE.md P14: dort erzeugt expliziter Euler Energie.

const G = 9.81;

export class Vehicle {
  constructor(meta, ground) {
    this.meta = meta;
    this.ground = ground;
    this.hpMul = 1;
    this.rideOffset = 0;
    this.reset(0, 0, 0);
    this.configure();
  }

  configure() {
    const m = this.meta;
    this.mass = m.kg;
    this.power = m.hp * 745.7 * 0.92 * this.hpMul;
    this.wb = m.wb_len;
    this.a = this.wb * 0.48;           // Schwerpunkt → Vorderachse
    this.b = this.wb - this.a;
    this.track = m.track;
    this.r = m.r;
    this.cg = Math.min(0.55, (m.H ?? 1.3) * 0.36);
    this.Iyaw = this.mass * (m.L * m.L + m.W * m.W) / 12;
    this.Ipitch = this.mass * m.L * m.L / 14;
    this.Iroll = this.mass * m.W * m.W / 10;
    this.mu = 1.05 * (m.grip ?? 1);
    this.drift = m.drift ?? 0.5;
    this.lock = (m.lock ?? 35) * Math.PI / 180;
    this.travel = m.travel ?? 0.16;
    const f = 1.35 * (m.stiff ?? 1);                 // Eigenfrequenz Hz
    this.k = this.mass / 4 * (2 * Math.PI * f) ** 2;
    this.c = 2 * 0.38 * Math.sqrt(this.k * this.mass / 4);
    this.q0 = this.mass * G / 4 / this.k;            // statische Einfederung
    this.drive = m.drive ?? 'RWD';
    const formula = m.klass === 'Formula';
    this.ClA = formula ? 4.2 : (m.klass === 'Drift Missile' ? 0.6 : 0.25);
    this.CdA = formula ? 1.1 : 0.72;
    this.vmax = (m.top_kmh ?? 220) / 3.6;
    this.redline = { rotary: 9000, f1: 12500, kei: 8000, boxer: 7500, v6_diesel: 4500, i4_na: 7800 }[m.sound] ?? 7200;
    this.gears = [3.4, 2.2, 1.6, 1.25, 1.0, 0.82];
    this.finalK = this.redline / 60 * 2 * Math.PI * this.r / (this.vmax * 1.02 * this.gears[5]);
    // Radpositionen (Aufbau-lokal, Konstruktionslage)
    this.wheels = [
      { key: 'FL', x: this.track / 2, z: this.a, front: true },
      { key: 'FR', x: -this.track / 2, z: this.a, front: true },
      { key: 'RL', x: this.track / 2, z: -this.b, front: false },
      { key: 'RR', x: -this.track / 2, z: -this.b, front: false },
    ];
    for (const w of this.wheels) Object.assign(w, { q: 0, qd: 0, F: this.mass * G / 4, spin: 0, y: this.r, slip: 0, contact: true });
  }

  reset(x, z, heading) {
    this.pos = { x, z };
    this.Y = this.ground(x, z);
    this.vel = { x: 0, z: 0 };
    this.vy = 0;
    this.heading = heading;
    this.yawRate = 0;
    this.pitch = 0; this.pitchV = 0;
    this.roll = 0; this.rollV = 0;
    this.steer = 0;
    this.gear = 1; this.rpm = 900;
    this.throttleS = 0;
    this.ax = 0; this.ay = 0;
    this.skid = 0;
    if (this.wheels) for (const w of this.wheels) { w.q = 0; w.qd = 0; }
  }

  get speed() { return Math.hypot(this.vel.x, this.vel.z); }
  get forwardSpeed() { return this.vel.x * Math.sin(this.heading) + this.vel.z * Math.cos(this.heading); }

  step(dt, inp) {
    const n = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / n;
    for (let i = 0; i < n; i++) this.#sub(h, inp);
  }

  #sub(dt, inp) {
    const s = Math.sin(this.heading), c = Math.cos(this.heading);
    const fwd = { x: s, z: c }, left = { x: c, z: -s };
    const vx = this.vel.x * fwd.x + this.vel.z * fwd.z;
    const vyL = this.vel.x * left.x + this.vel.z * left.z;
    const speed = Math.hypot(vx, vyL);

    // Lenkung: tempoabhängiger Einschlag, Rampe
    // Lenkung wie im echten Auto: bei Tempo nur wenige Grad (Kehrwert ~1/(1+v/12)),
    // Einschlag für die Tastatur auf 38° gedeckelt, gemächliche Lenkgeschwindigkeit.
    // Erste Fassung: automatisch voller Gegenlenk-Einschlag + 2,8 rad/s — die
    // Räder sprangen sichtbar von Anschlag zu Anschlag. Voll nur für den Autopiloten.
    const baseLock = inp.fullLock ? this.lock : Math.min(this.lock, 0.66);
    const lockNow = inp.fullLock ? this.lock : baseLock / (1 + speed / 12);
    const target = (inp.steer ?? 0) * lockNow;
    const rate = inp.fullLock ? 2.8 : 1.6;
    this.steer += Math.max(-dt * rate, Math.min(dt * rate, target - this.steer));
    const d = this.steer;

    // --- Aufbau: Federn gegen Boden
    let sumF = 0, tauP = 0, tauR = 0;
    for (const w of this.wheels) {
      const wx = this.pos.x + left.x * w.x + fwd.x * w.z;
      const wz = this.pos.z + left.z * w.x + fwd.z * w.z;
      const gy = this.ground(wx, wz);
      // Aufnahmepunkt: Hub + Nicken (positiv = Nase runter) + Wanken (positiv = links hoch)
      const mount = this.Y + this.r + this.rideOffset - w.z * Math.sin(this.pitch) + w.x * Math.sin(this.roll);
      const droop = this.travel * 0.7;
      const want = gy + this.r;
      let q = want - mount;                 // >0 = eingefedert
      w.contact = q > -droop;
      let F = 0;
      if (w.contact) {
        const qc = Math.min(q, this.travel);
        const qd = (qc - w.q) / dt;
        w.qd = qd;
        F = Math.max(0, this.k * (this.q0 + qc) + this.c * qd);
        if (q > this.travel) F += this.k * 12 * (q - this.travel) + this.c * 2 * Math.max(0, qd);  // Anschlag
        w.q = qc;
      } else {
        w.q = Math.max(-droop, w.q - dt * 2);
        w.qd = 0;
      }
      w.y = mount + Math.max(-droop, Math.min(this.travel, q)) ;   // Radmitte (Welt)
      w.F = F;
      sumF += F;
      tauP += -F * w.z;
      tauR += F * w.x;
    }
    // Abtrieb drückt auf die Reifen, nicht auf den Aufbau-Hub (vereinfachend)
    const down = 0.5 * 1.2 * this.ClA * speed * speed;

    // --- Reifen (Achslasten aus den Federn)
    const Ff = this.wheels[0].F + this.wheels[1].F + down * 0.45;
    const Fr = this.wheels[2].F + this.wheels[3].F + down * 0.55;
    const vxs = Math.max(Math.abs(vx), 1.5) * Math.sign(vx || 1);
    const alphaF = Math.atan2(vyL + this.a * this.yawRate, Math.abs(vxs)) - d * Math.sign(vxs);
    const alphaR = Math.atan2(vyL - this.b * this.yawRate, Math.abs(vxs));
    const hb = inp.handbrake ? 1 : 0;
    const muF = this.mu, muR = this.mu * (hb ? (0.72 - 0.25 * this.drift) : 1);
    const apF = 0.13, apR = 0.13 - 0.015 * this.drift;

    // Längskräfte
    const thr = inp.throttle ?? 0, brk = inp.brake ?? 0;
    this.throttleS += (thr - this.throttleS) * Math.min(1, dt * 8);
    let drive = 0;
    const reverse = inp.reverse;
    if (this.throttleS > 0.01) {
      const v = Math.max(Math.abs(vx), 4);
      drive = this.throttleS * Math.min(this.power / v, this.mass * G * 1.1) * (reverse ? -0.4 : 1);
      // Stabilitätshilfe: rutscht das Heck ohne Handbremse, wird Leistung weggenommen
      const beta0 = Math.abs(Math.atan2(vyL, Math.max(Math.abs(vx), 1)));
      if (!inp.handbrake && !inp.fullLock && beta0 > 0.08) drive *= 1 - Math.min(0.85, (beta0 - 0.08) * 5);
      if (!reverse && vx > this.vmax) drive = 0;
    }
    const brakeF = brk * this.mass * G * 1.05 * Math.sign(vx) * (Math.abs(vx) > 0.3 ? 1 : Math.abs(vx) / 0.3);
    const split = this.drive === 'FWD' ? [1, 0] : this.drive === 'AWD' ? [0.4, 0.6] : [0, 1];
    let FxF = drive * split[0] - brakeF * 0.65;
    let FxR = drive * split[1] - brakeF * 0.35 - hb * Math.sign(vx) * Math.min(Math.abs(vx) * 400, muR * Fr * 0.8);
    // Längs höchstens 80 % des Reibkreises: bei 100 % blieb der Hinterachse
    // unter Vollgas keine Seitenkraft, und jeder Drift drehte sich ein
    // (gemessen: 85° Winkel, danach 5 km/h). Arcade-Entscheidung, keine Physik.
    FxF = Math.max(-0.9 * muF * Ff, Math.min(0.9 * muF * Ff, FxF));
    FxR = Math.max(-0.8 * muR * Fr, Math.min(0.8 * muR * Fr, FxR));
    // Reibkreis: was längs übertragen wird, fehlt quer — daher das Übersteuern unter Last
    const capF = Math.sqrt(Math.max(0, (muF * Ff) ** 2 - FxF * FxF));
    const capR = Math.sqrt(Math.max(0, (muR * Fr) ** 2 - FxR * FxR)) * (1 - 0.08 * this.drift * Math.min(1, Math.abs(FxR) / (muR * Fr + 1)));
    const tyre = (alpha, ap, cap, fall) => {
      const x = alpha / ap;
      let f = Math.tanh(x * 1.1);
      if (fall) f *= 1 - 0.08 * Math.min(1, Math.max(0, (Math.abs(x) - 1) / 3));
      return -cap * f;
    };
    let FyF = tyre(alphaF, apF, capF, false);
    let FyR = tyre(alphaR, apR, capR, true);
    // Stillstand: keine Querkräfte aus Zahlenrauschen
    const slow = Math.min(1, speed / 2);
    FyF *= slow; FyR *= slow;

    const cd = Math.cos(d), sd = Math.sin(d);
    let Fx = FxF * cd - FyF * sd + FxR;
    let Fy = FxF * sd + FyF * cd + FyR;
    // Luft + Rollwiderstand
    const drag = 0.5 * 1.2 * this.CdA * speed * speed + this.mass * G * 0.012;
    if (speed > 0.05) { Fx -= drag * vx / speed; Fy -= drag * vyL / speed; }
    const inAir = !this.wheels.some(w => w.contact);
    if (inAir) { Fx = 0; Fy = 0; }

    const axC = Fx / this.mass, ayC = Fy / this.mass;
    this.vel.x += (axC * fwd.x + ayC * left.x) * dt;
    this.vel.z += (axC * fwd.z + ayC * left.z) * dt;
    if (speed < 0.4 && thr < 0.01) { this.vel.x *= 1 - dt * 3; this.vel.z *= 1 - dt * 3; }
    let yawAcc = (this.a * (FyF * cd + FxF * sd) - this.b * FyR) / this.Iyaw;
    if (inAir) yawAcc = 0;
    this.yawRate += yawAcc * dt;
    this.yawRate *= 1 - dt * (speed < 3 ? 6 : (hb || inp.fullLock ? 0.4 : 1.4));
    this.heading += this.yawRate * dt;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;

    // Aufbau integrieren (inkl. Trägheitsmomente aus Beschleunigung)
    this.ax = axC; this.ay = ayC + vx * this.yawRate * 0;
    const latAcc = vx * this.yawRate;   // Zentripetal = Kurvenfahrt
    tauP += -this.mass * axC * this.cg;
    tauR += this.mass * latAcc * this.cg;
    this.vy += (sumF / this.mass - G) * dt;
    this.Y += this.vy * dt;
    this.pitchV += (tauP / this.Ipitch - this.pitchV * 1.5) * dt;
    this.rollV += (tauR / this.Iroll - this.rollV * 1.5) * dt;
    this.pitch += this.pitchV * dt;
    this.roll += this.rollV * dt;
    this.pitch = Math.max(-0.25, Math.min(0.25, this.pitch));
    this.roll = Math.max(-0.25, Math.min(0.25, this.roll));
    // Bodenfang: der Aufbau darf nie unter die Radmitten sinken
    const gC = this.ground(this.pos.x, this.pos.z);
    if (this.Y < gC - 0.2) { this.Y = gC - 0.2; this.vy = Math.max(0, this.vy); }

    // Räder drehen; angetriebene Räder schlupfen unter Last
    const wheelSpin = Math.min(1, Math.abs(FxR) / (muR * Fr + 1)) * (this.drive !== 'FWD' ? 1 : 0) * this.throttleS;
    for (const w of this.wheels) {
      let v = vx;
      if (!w.front && hb) v = 0;
      else if (!w.front && wheelSpin > 0.85) v = vx + 12 * (wheelSpin - 0.85) * 10;
      w.spin += v / this.r * dt;
    }
    this.slipAngle = Math.atan2(vyL, Math.max(Math.abs(vx), 1));
    this.skid = inAir ? 0 : Math.min(1, Math.max(Math.abs(this.slipAngle) * 3 - 0.3, hb && speed > 3 ? 0.8 : 0, wheelSpin > 0.9 && speed > 2 ? 0.7 : 0));

    // Getriebe/Drehzahl (nur Anzeige + Ton)
    const wheelRpm = Math.abs(vx) / (2 * Math.PI * this.r) * 60;
    let rpm = wheelRpm * this.gears[this.gear - 1] * this.finalK / (Math.PI * 2) * 2 * Math.PI;
    if (rpm > this.redline * 0.95 && this.gear < 6) this.gear++;
    if (rpm < this.redline * 0.42 && this.gear > 1) this.gear--;
    rpm = wheelRpm * this.gears[this.gear - 1] * this.finalK;
    const idle = 900;
    const target2 = Math.max(idle + thr * (speed < 1 ? 2500 : 0), rpm);
    this.rpm += (Math.min(target2, this.redline) - this.rpm) * Math.min(1, dt * 10);
  }
}
