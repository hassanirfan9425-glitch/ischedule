import { useEffect, useRef } from 'react';
import { countdownText } from '../utils.js';

// Radius values are a percentage of the container's full width/height (how `left`/`top` percentages
// on an absolutely-positioned child actually resolve), not of the half-width — so the outermost ring
// has to stay comfortably under 50 or its own edge (let alone a star sitting on it) ends up past the
// container's boundary. 46 leaves room for the star's own radius before it touches 50.
function buildRings(count) {
  const minRadius = 13;
  const maxRadius = 46;
  const minSpin = 28;
  const spinStep = 12;
  return Array.from({ length: count }, (_, i) => ({
    radius: count === 1 ? maxRadius : minRadius + (i / (count - 1)) * (maxRadius - minRadius),
    spinSeconds: minSpin + i * spinStep,
  }));
}

// Ring count scales with how many exams are actually on the map, not a fixed number — a light term
// (5-6 exams) reads fine on 4 rings, but the same 4 rings holding 30 exams (e.g. "see all") would
// crowd 7-8 stars onto a single band. Growing roughly with the square root keeps each ring's
// population from ballooning in a straight line, so it never demands one ring per exam, capped at
// 10 so it doesn't just keep adding rings forever.
function ringCountFor(examCount) {
  const grown = 4 + Math.sqrt(Math.max(0, examCount - 6));
  return Math.min(10, Math.max(4, Math.round(grown)));
}

// Buckets by rank (how soon an exam is relative to the others currently shown), not by fixed day
// thresholds — a next-term final 90 days out and one 300 days out would otherwise land in the same
// "far" bucket and pile onto one ring. Splitting the sorted list into equal-ish groups keeps every
// ring populated and keeps the near-to-far read intact both ring-to-ring and, since each bucket is
// still in sorted order internally, position-to-position within a single ring.
function bucketExams(exams, rings) {
  const sorted = [...exams].sort((a, b) => (a.daysUntil ?? Infinity) - (b.daysUntil ?? Infinity));
  const buckets = rings.map(() => []);
  sorted.forEach((exam, i) => {
    const bucketIndex = Math.min(rings.length - 1, Math.floor((i / sorted.length) * rings.length));
    buckets[bucketIndex].push(exam);
  });
  return buckets;
}

function angleToPoint(radius, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return { left: 50 + radius * Math.cos(rad), top: 50 + radius * Math.sin(rad) };
}

export default function OrbitMap({ exams, holidays = [], onExamClick, onHolidayClick, zoomed }) {
  const rings = buildRings(ringCountFor(exams.length));
  const buckets = bucketExams(exams, rings);

  // Each star's fixed starting angle plus which ring it belongs to (radius + spin period + which
  // way that ring turns) — the animation loop below moves them by advancing this angle over time,
  // never by rotating a parent element. A star's own box, and the label inside it, are therefore
  // never subject to a transform: rotate() at all, which is what previously let a label end up
  // visibly tilted whenever it mounted mid-way through its ring's rotation instead of at the start
  // (the ring and its counter-rotating label only stay upright if both animations began at the
  // exact same instant — anything that broke that assumption, like a star moving to a new ring
  // after a "see all" toggle, left it permanently out of phase).
  const starMeta = [];
  const positionById = {};
  buckets.forEach((bucket, ringIndex) => {
    const direction = ringIndex % 2 === 0 ? 1 : -1;
    bucket.forEach((exam, i) => {
      const baseAngle = (i / bucket.length) * 360;
      const ring = rings[ringIndex];
      positionById[exam.id] = angleToPoint(ring.radius, baseAngle);
      starMeta.push({ id: exam.id, baseAngle, radius: ring.radius, spinSeconds: ring.spinSeconds, direction });
    });
  });

  const starRefs = useRef(new Map());

  // A stable key derived from *which* exams are shown, not the array reference — `exams` is a new
  // array from the parent on every render regardless of whether its contents changed, and depending
  // on it directly would restart (and re-zero the elapsed clock on) this loop on every incidental
  // parent re-render, not just when the actual bucket layout changes.
  const examSetKey = exams.map((e) => e.id).sort((a, b) => a - b).join(',');

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return undefined;
    const start = performance.now();
    let frameId;
    function tick(now) {
      const elapsedMs = now - start;
      for (const meta of starMeta) {
        const revolutionDeg = (elapsedMs / (meta.spinSeconds * 1000)) * 360 * meta.direction;
        const { left, top } = angleToPoint(meta.radius, meta.baseAngle + revolutionDeg);
        const node = starRefs.current.get(meta.id);
        if (node) {
          node.style.left = `${left}%`;
          node.style.top = `${top}%`;
        }
      }
      frameId = requestAnimationFrame(tick);
    }
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
    // Restarts when the exam *set* changes (new bucket layout, e.g. after "see all") — intentional,
    // a fresh layout needs fresh starting angles rather than continuing to animate stale ones.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examSetKey, zoomed]);

  // A meteor sits between the two exams it falls between chronologically, not on a ring of its own
  // and not following either exam's orbit — just loitering in roughly the right neighborhood. If a
  // holiday has no exam on one side (nothing scheduled before/after it yet), it anchors to whichever
  // side does exist.
  const sortedExams = [...exams].sort((a, b) => (a.daysUntil ?? Infinity) - (b.daysUntil ?? Infinity));
  const meteors = holidays
    .map((holiday, i) => {
      let before = null;
      let after = null;
      for (const exam of sortedExams) {
        if (exam.daysUntil === null) continue;
        if (exam.daysUntil <= holiday.daysUntil) before = exam;
        if (exam.daysUntil > holiday.daysUntil && !after) after = exam;
      }
      if (!before && !after) return null;
      const beforePos = before ? positionById[before.id] : positionById[after.id];
      const afterPos = after ? positionById[after.id] : positionById[before.id];
      const span = before && after ? after.daysUntil - before.daysUntil : 1;
      const t = before && after ? Math.min(1, Math.max(0, (holiday.daysUntil - before.daysUntil) / (span || 1))) : 0.5;
      return {
        holiday,
        left: beforePos.left + (afterPos.left - beforePos.left) * t,
        top: beforePos.top + (afterPos.top - beforePos.top) * t,
        duration: 15 + (i % 4) * 2.5,
        delay: (i % 5) * 1.3,
      };
    })
    .filter(Boolean);

  return (
    <div className={zoomed ? 'orbit-map orbit-map-zoom-out' : 'orbit-map'}>
      <div className="orbit-map-rings">
        {rings.map((ring, i) => (
          <span key={i} className="orbit-map-ring" style={{ width: `${ring.radius * 2}%`, height: `${ring.radius * 2}%` }} />
        ))}
      </div>
      <div className="orbit-map-sun" title="Today" />

      {exams.length === 0 && <div className="orbit-map-empty">Nothing in orbit yet.</div>}

      {starMeta.map((meta) => {
        const exam = exams.find((e) => e.id === meta.id);
        if (!exam) return null;
        const { left, top } = positionById[exam.id];
        return (
          <button
            key={exam.id}
            ref={(node) => {
              if (node) starRefs.current.set(exam.id, node);
              else starRefs.current.delete(exam.id);
            }}
            type="button"
            className={`orbit-star color-${exam.color}${exam.priority ? ' priority' : ''}`}
            style={{ left: `${left}%`, top: `${top}%` }}
            onClick={() => onExamClick(exam)}
            title={`${exam.subjectLabel} · ${countdownText(exam.daysUntil)}`}
          >
            <span className="orbit-star-label">{exam.subjectLabel}</span>
          </button>
        );
      })}

      {meteors.map((meteor) => (
        <div
          key={meteor.holiday.id}
          className="orbit-meteor-anchor"
          style={{ left: `${meteor.left}%`, top: `${meteor.top}%` }}
          onClick={() => onHolidayClick && onHolidayClick(meteor.holiday)}
          title={meteor.holiday.label}
        >
          <div className="orbit-meteor" style={{ animationDuration: `${meteor.duration}s`, animationDelay: `${meteor.delay}s` }}>
            <span className="orbit-meteor-tail" />
          </div>
        </div>
      ))}
    </div>
  );
}
