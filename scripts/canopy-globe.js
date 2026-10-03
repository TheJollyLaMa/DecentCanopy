/* global GTPData */
(function () {
  'use strict';
  const spacePositions = new Map();
  let markers = [];

  function project(latitude, longitude, centerLatitude, centerLongitude) {
    const rad = Math.PI / 180;
    const lat = latitude * rad;
    const lon = (longitude - centerLongitude) * rad;
    const center = centerLatitude * rad;
    return {
      x: Math.cos(lat) * Math.sin(lon),
      y: -(Math.cos(center) * Math.sin(lat) - Math.sin(center) * Math.cos(lat) * Math.cos(lon)),
      visible: Math.sin(center) * Math.sin(lat) + Math.cos(center) * Math.cos(lat) * Math.cos(lon) >= 0,
    };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { project };
    return;
  }

  document.addEventListener('DOMContentLoaded', () => {
    const dialog = document.getElementById('canopy-globe-dialog');
    const canvas = document.getElementById('canopy-globe');
    const ctx = canvas.getContext('2d');
    const longitude = document.getElementById('globe-longitude');
    const latitude = document.getElementById('globe-latitude');
    const list = document.getElementById('globe-entities');
    const status = document.getElementById('globe-status');
    let entities = [];

    function select(id) {
      dialog.close();
      window.dispatchEvent(new CustomEvent('decentcanopy:select-entity', { detail: id }));
    }

    function draw() {
      if (!dialog.open) return;
      const bounds = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.round(bounds.width * ratio);
      canvas.height = Math.round(bounds.height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      const cx = bounds.width / 2;
      const cy = bounds.height / 2;
      const radius = Math.min(bounds.width, bounds.height) * 0.34;
      const centerLat = Number(latitude.value);
      const centerLon = Number(longitude.value);
      ctx.fillStyle = '#070e1e';
      ctx.fillRect(0, 0, bounds.width, bounds.height);
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = '#102d3c';
      ctx.fill();
      ctx.strokeStyle = '#67bca8';
      ctx.lineWidth = 1;
      ctx.stroke();
      function grid(points) {
        ctx.beginPath();
        let drawing = false;
        points.forEach(([lat, lon]) => {
          const p = project(lat, lon, centerLat, centerLon);
          if (!p.visible) { drawing = false; return; }
          if (drawing) ctx.lineTo(cx + p.x * radius, cy + p.y * radius);
          else ctx.moveTo(cx + p.x * radius, cy + p.y * radius);
          drawing = true;
        });
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(110,231,183,0.18)';
      for (let lat = -60; lat <= 60; lat += 30) {
        grid(Array.from({ length: 181 }, (_, i) => [lat, i * 2 - 180]));
      }
      for (let lon = -180; lon < 180; lon += 30) {
        grid(Array.from({ length: 91 }, (_, i) => [i * 2 - 90, lon]));
      }
      markers = entities.flatMap(entity => {
        const place = entity.sharedLocation;
        if (place.precision === 'space') {
          if (!spacePositions.has(entity.id)) spacePositions.set(entity.id, {
            angle: Math.random() * Math.PI * 2, distance: 1.25 + Math.random() * 0.13,
          });
          const p = spacePositions.get(entity.id);
          return [{ entity, x: cx + Math.cos(p.angle) * radius * p.distance,
            y: cy + Math.sin(p.angle) * radius * p.distance, color: '#c4b5fd' }];
        }
        if (place.latitude == null) return [];
        const p = project(place.latitude, place.longitude, centerLat, centerLon);
        return p.visible ? [{ entity, x: cx + p.x * radius, y: cy + p.y * radius, color: '#6ee7b7' }] : [];
      });
      const byId = new Map(markers.map(marker => [marker.entity.id, marker]));
      ctx.strokeStyle = 'rgba(196,181,253,0.3)';
      ctx.setLineDash([3, 5]);
      GTPData.getAssociations().forEach(edge => {
        const a = byId.get(edge.source);
        const b = byId.get(edge.target);
        if (!a || !b) return;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(cx, cy - radius * 0.35, b.x, b.y);
        ctx.stroke();
      });
      ctx.setLineDash([]);
      markers.forEach(marker => {
        ctx.beginPath();
        ctx.arc(marker.x, marker.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = marker.color;
        ctx.fill();
      });
      const unplaced = entities.filter(entity => entity.sharedLocation.precision !== 'space'
        && entity.sharedLocation.latitude == null).length;
      status.textContent = `${entities.length} opted-in locations · ${markers.length} visible markers · ${unplaced} label-only entries. View center ${centerLat}°, ${centerLon}°. Select a marker or use the complete location list.`;
    }

    document.getElementById('globe-open').addEventListener('click', async () => {
      dialog.showModal();
      try {
        await GTPData.load();
        const greenTea = new URLSearchParams(window.location.search).get('canopy') === 'green-tea';
        const all = GTPData.getProjects();
        const ids = new Set();
        if (greenTea) {
          const party = all.find(entity => entity.slug === 'green-tea-party');
          if (party) {
            ids.add(party.id);
            GTPData.getAssociations().filter(edge => edge.type === 'associated-project'
              && (edge.source === party.id || edge.target === party.id))
              .forEach(edge => { ids.add(edge.source); ids.add(edge.target); });
          }
        }
        entities = all.filter(entity => entity.sharedLocation && (!greenTea || ids.has(entity.id)));
        list.replaceChildren();
        entities.forEach(entity => {
          const place = entity.sharedLocation;
          const button = document.createElement('button');
          button.className = 'toolbar-btn';
          button.type = 'button';
          button.textContent = `${entity.name} — ${place.label} (${place.precision}${place.latitude != null ? `: ${place.latitude}, ${place.longitude}` : place.precision === 'space' ? ', symbolic' : ', coordinates not supplied'})`;
          button.addEventListener('click', () => select(entity.id));
          list.appendChild(button);
        });
        draw();
      } catch (error) {
        status.textContent = `Could not load globe locations: ${error.message}`;
      }
    });
    document.getElementById('globe-close').addEventListener('click', () => dialog.close());
    longitude.addEventListener('input', draw);
    latitude.addEventListener('input', draw);
    new ResizeObserver(draw).observe(canvas);
    canvas.addEventListener('click', event => {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const nearest = markers.slice().sort((a, b) =>
        Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
      if (nearest && Math.hypot(nearest.x - x, nearest.y - y) < 14) select(nearest.entity.id);
    });
  });
}());
