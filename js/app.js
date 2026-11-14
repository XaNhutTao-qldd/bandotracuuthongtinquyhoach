/**
 * WebGIS Tra cứu Quy hoạch – Xã Nhựt Tảo
 * Giao diện kiểu sidebar trái + toolbar phải (xanh da trời)
 */
(function () {
  "use strict";

  var CFG = window.APP_CONFIG;
  var F = CFG.FIELDS;
  var currentTab = "tothua";
  var lastInfoText = "";
  var lastCenterLonLat = null;

  function $(sel, ctx) {
    return (ctx || document).querySelector(sel);
  }
  function $$(sel, ctx) {
    return Array.prototype.slice.call((ctx || document).querySelectorAll(sel));
  }

  function maskName(name) {
    if (!CFG.CHE_TEN_CHU_SU_DUNG || !name) return name || "";
    return String(name)
      .trim()
      .split(/\s+/)
      .map(function (p) {
        return p.length <= 1 ? p : p[0] + "***";
      })
      .join(" ");
  }

  function formatNumber(n, unit) {
    if (n === null || n === undefined || n === "") return "—";
    var num = Number(n);
    if (isNaN(num)) return String(n);
    var s = num.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
    return unit ? s + " " + unit : s;
  }

  function showToast(msg, ms) {
    var el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () {
      el.classList.remove("show");
    }, ms || 2800);
  }

  // ---------- map ----------
  var map, parcelLayer, parcelSource, planningLayer;
  var selectedFeature = null;
  var hoverFeature = null;
  var measureDraw = null;
  var measureSource = null;
  var measureLayer = null;
  var measureType = null;
  var measureListener = null;
  var gpsMarker = null;
  var labelOverlay = null;
  var baseLayers = {};
  var ownerIndex = null;
  var parcelIndex = null;
  var hiddenSheets = {};
  var sheetStats = []; // [{id, count}]

  function initMap() {
    // Mặc định nền trắng — chỉ bật khi người dùng chọn
    baseLayers.satellite = new ol.layer.Tile({
      visible: false,
      source: new ol.source.XYZ({
        url: "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
        attributions: "Google"
      })
    });
    baseLayers.street = new ol.layer.Tile({
      visible: false,
      source: new ol.source.XYZ({
        url: "https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}",
        attributions: "Google"
      })
    });
    baseLayers.terrain = new ol.layer.Tile({
      visible: false,
      source: new ol.source.XYZ({
        url: "https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}",
        attributions: "Google"
      })
    });

    var format = new ol.format.GeoJSON();
    var features = format.readFeatures(json_Aggregated_0, {
      dataProjection: "EPSG:4326",
      featureProjection: "EPSG:3857"
    });
    parcelSource = new ol.source.Vector({ features: features });

    // Lớp quy hoạch riêng từ VungNhutTao (polygon quy hoạch)
    var planningFeatures = [];
    if (typeof json_VungNhutTao_1 !== "undefined") {
      planningFeatures = format.readFeatures(json_VungNhutTao_1, {
        dataProjection: "EPSG:4326",
        featureProjection: "EPSG:3857"
      });
    }
    var planningSource = new ol.source.Vector({ features: planningFeatures });
    // giữ reference để kiểm tra thửa có giao lớp quy hoạch không
    window.__planningSource = planningSource;

    function isSheetVisible(feature) {
      var s = feature.get(F.soTo);
      if (s === null || s === undefined || String(s).trim() === "") return true;
      return !hiddenSheets[String(s)];
    }
    function styleParcelFiltered(feature, resolution) {
      if (!isSheetVisible(feature)) return null;
      return styleAggregated(feature, resolution);
    }

    parcelLayer = new ol.layer.Vector({
      source: parcelSource,
      style: styleParcelFiltered,
      opacity: 1.0,
      declutter: false
    });

    // Lớp quy hoạch (VungNhutTao) — nằm trên lớp thửa
    planningLayer = new ol.layer.Vector({
      source: planningSource,
      style: stylePlanning,
      opacity: 0.7,
      visible: false,
      declutter: false
    });

    measureSource = new ol.source.Vector();
    measureLayer = new ol.layer.Vector({
      source: measureSource,
      style: new ol.style.Style({
        fill: new ol.style.Fill({ color: "rgba(59,184,224,0.2)" }),
        stroke: new ol.style.Stroke({
          color: "#1a9fd1",
          width: 2,
          lineDash: [8, 6]
        }),
        image: new ol.style.Circle({
          radius: 5,
          fill: new ol.style.Fill({ color: "#1a9fd1" }),
          stroke: new ol.style.Stroke({ color: "#fff", width: 1.5 })
        })
      })
    });

    map = new ol.Map({
      target: "map",
      layers: [
        baseLayers.satellite,
        baseLayers.street,
        baseLayers.terrain,
        parcelLayer,
        planningLayer,
        measureLayer
      ],
      view: new ol.View({
        center: ol.proj.fromLonLat([CFG.TAM_BAN_DO[1], CFG.TAM_BAN_DO[0]]),
        zoom: CFG.ZOOM_MAC_DINH,
        maxZoom: 20,
        minZoom: 10
      }),
      controls: ol.control.defaults.defaults({
        zoom: false,
        attribution: true,
        rotate: false
      }).extend([new ol.control.ScaleLine({ units: "metric" })])
    });

    map.on("pointermove", onPointerMove);
    map.on("singleclick", onMapClick);

    var loading = $("#loading");
    if (loading) loading.style.display = "none";

    buildOwnerIndex();
  }

  function clearHover() {
    if (hoverFeature) {
      hoverFeature.set("_hover", false);
      hoverFeature = null;
    }
  }

  function clearSelect() {
    if (selectedFeature) {
      selectedFeature.set("_selected", false);
      selectedFeature = null;
    }
    if (labelOverlay) {
      map.removeOverlay(labelOverlay);
      labelOverlay = null;
    }
    $("#empty-state").style.display = "";
    $("#info-content").classList.remove("visible");
    $("#btn-copy").disabled = true;
    $("#btn-direction").disabled = true;
    lastInfoText = "";
    lastCenterLonLat = null;
    var panel = $("#info-panel");
    if (panel) panel.classList.remove("has-content");
  }

  function selectFeature(feature) {
    clearSelect();
    clearHover();
    selectedFeature = feature;
    feature.set("_selected", true);
    showInfo(feature);

    var geom = feature.getGeometry();
    if (!geom) return;
    var extent = geom.getExtent();
    var center = ol.extent.getCenter(extent);
    lastCenterLonLat = ol.proj.toLonLat(center);

    // Label overlay
    var soTo = feature.get(F.soTo) || "";
    var soThua = feature.get(F.soThua) || "";
    var el = document.createElement("div");
    el.style.cssText =
      "background:rgba(15,23,42,0.9);color:#fff;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:700;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.25);pointer-events:none;";
    el.textContent = "Tờ " + soTo + " · Thửa " + soThua;
    labelOverlay = new ol.Overlay({
      element: el,
      positioning: "center-center",
      position: center,
      stopEvent: false
    });
    map.addOverlay(labelOverlay);

    // Chỉ pan nhẹ tới thửa, giữ nguyên mức zoom hiện tại (không "chạy" nền)
    var view = map.getView();
    var curZoom = view.getZoom();
    var size = map.getSize();
    var isMobile = window.matchMedia && window.matchMedia("(max-width: 640px)").matches;
    var panelPad = isMobile ? 40 : 360; // chừa panel
    var px = size ? [size[0] / 2 - panelPad / 2, size[1] / 2] : undefined;
    view.animate({
      center: center,
      duration: CFG.BAY_DEN_THUA_MUOT ? 350 : 0
    });
    // Nếu thửa quá nhỏ/lớn so với view hiện tại thì mới fit nhẹ
    var res = view.getResolution();
    if (res && extent) {
      var w = extent[2] - extent[0];
      var h = extent[3] - extent[1];
      var mapW = size ? size[0] * res : w;
      var mapH = size ? size[1] * res : h;
      // chỉ zoom nếu thửa chiếm < 2% hoặc > 80% khung nhìn
      var ratio = (w * h) / (mapW * mapH + 1e-9);
      if (ratio < 0.02 || ratio > 0.8) {
        view.fit(extent, {
          padding: [80, 80, 80, panelPad],
          maxZoom: Math.min(18, (curZoom || 16) + 1),
          minZoom: Math.max(12, (curZoom || 14) - 1),
          duration: CFG.BAY_DEN_THUA_MUOT ? 350 : 0
        });
      }
    }
  }

  function updateCoordHud(lonLat, feature) {
    var el = $("#coord-hud");
    if (!el) return;
    if (!lonLat) {
      el.classList.remove("visible");
      el.innerHTML = "";
      return;
    }
    var lon = lonLat[0].toFixed(6);
    var lat = lonLat[1].toFixed(6);
    var extra = "";
    if (feature) {
      var st = feature.get(F.soTo);
      var sth = feature.get(F.soThua);
      if (st != null && sth != null) {
        extra = "<span>Tờ " + st + " · Thửa " + sth + "</span>";
      }
    }
    el.innerHTML =
      extra +
      "<strong>X " +
      lon +
      " · Y " +
      lat +
      "</strong>";
    el.classList.add("visible");
  }

  function onPointerMove(evt) {
    if (evt.dragging) return;
    var pixel = map.getEventPixel(evt.originalEvent);
    var feature = null;
    if (!measureType) {
      var hit = map.hasFeatureAtPixel(pixel, {
        layerFilter: function (l) {
          return l === parcelLayer;
        }
      });
      map.getTargetElement().style.cursor = hit ? "pointer" : "";

      feature = map.forEachFeatureAtPixel(
        pixel,
        function (f) {
          return f;
        },
        {
          layerFilter: function (l) {
            return l === parcelLayer;
          }
        }
      );
      if (feature !== hoverFeature) {
        clearHover();
        if (feature && feature !== selectedFeature) {
          hoverFeature = feature;
          feature.set("_hover", true);
        }
      }
    }

    // Tọa độ góc dưới phải khi rê trên thửa
    if (feature) {
      var lonLat = ol.proj.toLonLat(evt.coordinate);
      updateCoordHud(lonLat, feature);
    } else {
      updateCoordHud(null, null);
    }
  }

  function closeFloatingTools() {
    var pop = $("#layer-popover");
    if (pop) pop.classList.remove("open");
    var btn = $("#btn-layers");
    if (btn) btn.classList.remove("active");
    // Đóng gợi ý tìm kiếm
    var st = $("#suggest-tothua");
    var so = $("#suggest-owner");
    if (st) st.innerHTML = "";
    if (so) so.innerHTML = "";
  }

  function onMapClick(evt) {
    closeFloatingTools();
    if (measureType) return;
    // Ưu tiên thửa đất
    var feature = map.forEachFeatureAtPixel(
      evt.pixel,
      function (f) {
        return f;
      },
      {
        layerFilter: function (l) {
          return l === parcelLayer;
        }
      }
    );
    if (feature) {
      selectFeature(feature);
      return;
    }
    // Không có thửa → thử lớp quy hoạch
    var planFeat = map.forEachFeatureAtPixel(
      evt.pixel,
      function (f) {
        return f;
      },
      {
        layerFilter: function (l) {
          return l === planningLayer;
        }
      }
    );
    if (planFeat) {
      clearSelect();
      showPlanningInfo(planFeat);
    } else {
      clearSelect();
    }
  }


  function hideInfoPanel() {
    var panel = $("#info-panel");
    if (panel) panel.classList.remove("has-content");
    var es = $("#empty-state");
    var ic = $("#info-content");
    if (es) es.style.display = "";
    if (ic) ic.classList.remove("visible");
    var bc = $("#btn-copy");
    var bd = $("#btn-direction");
    if (bc) bc.disabled = true;
    if (bd) bd.disabled = true;
    lastInfoText = "";
  }

  function showPlanningInfo(feature) {
    var blockThua = $("#block-thua");
    var blockRatio = $("#block-ratio");
    var blockQh = $("#block-qh");
    if (!blockThua) return;
    blockThua.innerHTML = "";
    if (blockRatio) {
      blockRatio.style.display = "none";
      blockRatio.innerHTML = "";
    }
    // Không hiện khối "Chi tiết quy hoạch" khi click lớp QH
    if (blockQh) {
      blockQh.innerHTML = "";
      blockQh.style.display = "none";
    }

    var h3 = document.createElement("h3");
    h3.textContent = "Vùng quy hoạch";
    blockThua.appendChild(h3);

    var madat = feature.get("MadatQH");
    var ten = feature.get("LoaidatQH");
    var dt = feature.get("DienTich");

    addRow(blockThua, "Mã loại đất", madat);
    addRow(blockThua, "Tên loại đất", ten);
    addRow(blockThua, "Diện tích", formatNumber(dt, "m²"));

    lastInfoText = [
      "Vùng quy hoạch",
      "Mã: " + (madat || "_"),
      "Loại đất: " + (ten || "_"),
      "Diện tích: " + formatNumber(dt, "m²")
    ].join("\n");

    $("#empty-state").style.display = "none";
    $("#info-content").classList.add("visible");
    $("#btn-copy").disabled = false;
    $("#btn-direction").disabled = true;
    var panel = $("#info-panel");
    if (panel) panel.classList.add("has-content");
  }

  // ---------- info panel ----------
  function getProp(feature, key) {
    if (!key) return null;
    return feature.get(key);
  }

  function isEmpty(value) {
    return (
      value === null ||
      value === undefined ||
      value === "" ||
      String(value) === "None" ||
      String(value) === "null"
    );
  }

  function addRow(parent, label, value) {
    var row = document.createElement("div");
    row.className = "info-row";
    var l = document.createElement("span");
    l.className = "label";
    l.textContent = label;
    var v = document.createElement("span");
    v.className = "value";
    if (isEmpty(value)) {
      v.textContent = "_";
      v.style.opacity = "0.7";
    } else {
      v.textContent = String(value);
    }
    row.appendChild(l);
    row.appendChild(v);
    parent.appendChild(row);
  }

  // Parse chuỗi DTtong dạng "ONT: 380.1m2, LUC: 50m2" → [{ma, dt}, ...]
  function parseDTtong(raw) {
    if (raw === null || raw === undefined) return [];
    var s = String(raw).replace(/m²/gi, "m2").replace(/m2/gi, "");
    var parts = s.split(",");
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].trim();
      if (!p) continue;
      var m = p.match(/^([A-Za-z0-9+]+)\s*:\s*([0-9.]+)/);
      if (m) {
        var dt = parseFloat(m[2]);
        if (!isNaN(dt) && dt > 0) {
          out.push({ ma: m[1].toUpperCase(), dt: dt });
        }
      }
    }
    return out;
  }

  // Tên loại đất từ mã (đầy đủ các mã thường gặp trong DTtong)
  var TEN_LOAI_DAT = {
    ONT: "Đất ở tại nông thôn",
    ODT: "Đất ở tại đô thị",
    LUC: "Đất chuyên trồng lúa",
    LUK: "Đất trồng lúa",
    LUA: "Đất trồng lúa",
    LNK: "Đất trồng cây lâu năm",
    CLN: "Đất trồng cây lâu năm",
    HNK: "Đất trồng cây hàng năm khác",
    HHK: "Đất trồng cây hàng năm khác",
    BHK: "Đất bằng trồng cây hàng năm khác",
    NTS: "Đất nuôi trồng thủy sản",
    TMD: "Đất thương mại, dịch vụ",
    SKC: "Đất cơ sở sản xuất phi nông nghiệp",
    SKK: "Đất sản xuất vật liệu xây dựng, làm đồ gốm",
    SKN: "Đất sản xuất kinh doanh phi nông nghiệp",
    DGT: "Đất giao thông",
    DTL: "Đất thủy lợi",
    DGD: "Đất xây dựng cơ sở giáo dục và đào tạo",
    DYT: "Đất xây dựng cơ sở y tế",
    DVH: "Đất xây dựng cơ sở văn hóa",
    DSH: "Đất sinh hoạt cộng đồng",
    DKV: "Đất khu vui chơi, giải trí công cộng",
    DCH: "Đất chợ",
    DTT: "Đất công trình công cộng khác",
    DNL: "Đất công trình năng lượng",
    DDT: "Đất có di tích lịch sử - văn hóa",
    DBV: "Đất bãi thải, xử lý chất thải",
    SON: "Đất sông, ngòi, kênh, rạch, suối",
    MNC: "Đất mặt nước chuyên dùng",
    TSN: "Đất có mặt nước chuyên dùng",
    RPH: "Đất rừng phòng hộ",
    RSX: "Đất rừng sản xuất",
    RDD: "Đất rừng đặc dụng",
    CQP: "Đất quốc phòng",
    CAN: "Đất an ninh",
    TIN: "Đất có di tích lịch sử - văn hóa",
    TON: "Đất cơ sở tôn giáo",
    TSC: "Đất có công trình sự nghiệp",
    NTD: "Đất chưa sử dụng",
    BCS: "Đất bằng chưa sử dụng",
    NKH: "Đất nông nghiệp khác"
  };

  // Mã thuộc lớp quy hoạch VungNhutTao — dùng để xác định thửa "có quy hoạch"
  var PLANNING_CODES = {
    CAN: 1, CQP: 1, DCH: 1, DGD: 1, DGT: 1, DKV: 1, DTL: 1, DTT: 1, DVH: 1,
    NKH: 1, NTD: 1, ONT: 1, ODT: 1, SKC: 1, SKK: 1, SKN: 1, TMD: 1, TON: 1,
    TIN: 1, TSC: 1, SON: 1, MNC: 1, RPH: 1, RSX: 1, RDD: 1
  };

  function showInfo(feature) {
    var blockThua = $("#block-thua");
    var blockRatio = $("#block-ratio");
    var blockQh = $("#block-qh");
    blockThua.innerHTML = "";
    blockRatio.innerHTML = "";
    blockQh.innerHTML = "";
    if (blockQh) blockQh.style.display = "";

    var h3 = document.createElement("h3");
    h3.textContent = "Thửa đất";
    blockThua.appendChild(h3);

    var soTo = getProp(feature, F.soTo);
    var soThua = getProp(feature, F.soThua);
    var maThua =
      getProp(feature, F.maThua) ||
      (soTo != null && soThua != null ? String(soTo) + "_" + String(soThua) : null);
    var dt = getProp(feature, F.dienTich);
    var ht = getProp(feature, F.hienTrang);
    var chu = maskName(getProp(feature, F.chuSuDung));
    var diaChi = getProp(feature, F.diaChi);

    addRow(blockThua, "Số tờ", soTo);
    addRow(blockThua, "Số thửa", soThua);
    addRow(blockThua, "Diện tích", formatNumber(dt, "m²"));
    // Bỏ mã đất trong ngoặc ở cuối (ví dụ " (NTS)")
    var htDisplay = ht;
    if (htDisplay !== null && htDisplay !== undefined) {
      htDisplay = String(htDisplay).replace(/\s*\([A-Z0-9+]+\)\s*$/i, "").trim();
    }
    addRow(blockThua, "Hiện trạng", htDisplay);
    addRow(blockThua, "Chủ sử dụng", chu);
    addRow(blockThua, "Địa chỉ", diaChi);

    // Ẩn khối tỷ lệ %
    if (blockRatio) {
      blockRatio.style.display = "none";
      blockRatio.innerHTML = "";
    }

// ===== Quy hoạch: giao hình học với lớp VungNhutTao (chuẩn) =====
    // Kết hợp thuộc tính DTQH + mã QH trong DTtong để giảm sai số biên.
    function collectCoords(geom, maxPts) {
      var out = [];
      if (!geom) return out;
      maxPts = maxPts || 80;
      try {
        if (typeof geom.getInteriorPoint === "function") {
          out.push(geom.getInteriorPoint().getCoordinates());
        }
      } catch (e0) {}
      try {
        var type = geom.getType ? geom.getType() : "";
        var outerRings = [];
        if (type === "Polygon") {
          var pc = geom.getCoordinates();
          if (pc && pc[0]) outerRings.push(pc[0]);
        } else if (type === "MultiPolygon") {
          var polys = geom.getCoordinates() || [];
          for (var pj = 0; pj < polys.length; pj++) {
            if (polys[pj] && polys[pj][0]) outerRings.push(polys[pj][0]);
          }
        }
        for (var r = 0; r < outerRings.length; r++) {
          var ring = outerRings[r];
          if (!ring || !ring.length) continue;
          var step = Math.max(1, Math.floor(ring.length / 24));
          for (var k = 0; k < ring.length && out.length < maxPts; k += step) {
            out.push(ring[k]);
          }
        }
      } catch (e1) {}
      // Lưới điểm CHỈ giữ điểm thực sự nằm trong polygon (tránh false positive biên)
      try {
        var extent = geom.getExtent();
        var minX = extent[0],
          minY = extent[1],
          maxX = extent[2],
          maxY = extent[3];
        for (var gx = 0; gx < 4; gx++) {
          for (var gy = 0; gy < 4; gy++) {
            var gp = [
              minX + ((gx + 0.5) / 4) * (maxX - minX),
              minY + ((gy + 0.5) / 4) * (maxY - minY)
            ];
            try {
              if (geom.intersectsCoordinate(gp)) out.push(gp);
            } catch (eg) {}
          }
        }
      } catch (e2) {}
      return out;
    }

    function pointInGeom(geom, pt) {
      if (!geom || !pt) return false;
      try {
        if (geom.intersectsCoordinate(pt)) return true;
      } catch (e) {}
      // MultiPolygon: thử từng polygon
      try {
        if (geom.getType && geom.getType() === "MultiPolygon" && geom.getPolygon) {
          var n = geom.getPolygons ? geom.getPolygons().length : 1;
          for (var i = 0; i < n; i++) {
            var p = geom.getPolygon(i);
            if (p && p.intersectsCoordinate && p.intersectsCoordinate(pt)) return true;
          }
        }
      } catch (e2) {}
      return false;
    }

    function parcelInPlanningZone(feat) {
      var geom = feat.getGeometry();
      if (!geom || !window.__planningSource) return false;
      var extent = geom.getExtent();
      var parcelPts = collectCoords(geom, 60);
      var found = false;
      window.__planningSource.forEachFeatureIntersectingExtent(extent, function (pf) {
        if (found) return;
        var madat = pf.get("MadatQH");
        if (
          madat === null ||
          madat === undefined ||
          String(madat).trim() === "" ||
          String(madat) === "None" ||
          String(madat) === "null"
        ) {
          return;
        }
        var pg = pf.getGeometry();
        if (!pg) return;
        try {
          // 1) Điểm thửa nằm trong polygon QH
          for (var i = 0; i < parcelPts.length; i++) {
            if (pointInGeom(pg, parcelPts[i])) {
              found = true;
              return;
            }
          }
          // 2) Điểm QH nằm trong thửa (bắt thửa bao phủ vùng QH nhỏ)
          var planPts = collectCoords(pg, 40);
          for (var j = 0; j < planPts.length; j++) {
            if (pointInGeom(geom, planPts[j])) {
              found = true;
              return;
            }
          }
        } catch (e) {}
      });
      return found;
    }

    // ===== Quy tắc theo yêu cầu =====
    // - Thửa giao lớp quy hoạch (cả thửa hoặc một phần) → Có QH, hiện HẾT DTtong
    // - Thửa hoàn toàn ngoài lớp quy hoạch → "Ngoài quy hoạch"
    var inZone = parcelInPlanningZone(feature);

    var dtTongRaw = getProp(feature, F.dtTong);
    var qhItemsAll = parseDTtong(dtTongRaw);
    var qhItems = [];
    for (var qi = 0; qi < qhItemsAll.length; qi++) {
      if (qhItemsAll[qi].dt > 0) qhItems.push(qhItemsAll[qi]);
    }

    var dtqhVal = getProp(feature, F.dienTichQH);
    var dtqhNum = dtqhVal !== null && dtqhVal !== undefined && dtqhVal !== "" ? Number(dtqhVal) : 0;
    if (isNaN(dtqhNum)) dtqhNum = 0;

    // Chỉ dựa vào giao hình học với lớp VungNhutTao
    var hasQH = inZone;

    var totalQh = 0;
    for (var tj = 0; tj < qhItems.length; tj++) totalQh += qhItems[tj].dt;
    if (totalQh <= 0 && dtqhNum > 0) totalQh = dtqhNum;

    if (!hasQH) {
      addRow(blockThua, "Quy hoạch", "Ngoài quy hoạch");
      if (blockQh) {
        blockQh.innerHTML = "";
        blockQh.style.display = "none";
      }
    } else {
      if (blockQh) blockQh.style.display = "";
      var h3q = document.createElement("h3");
      h3q.textContent = "Chi tiết quy hoạch";
      blockQh.appendChild(h3q);

      // Hiện HẾT các loại đất trong DTtong (QH + phần hiện trạng còn lại)
      if (qhItems.length > 0) {
        for (var i = 0; i < qhItems.length; i++) {
          var item = qhItems[i];
          var card = document.createElement("div");
          card.className = "qh-card";
          var sw = document.createElement("div");
          sw.className = "qh-swatch";
          var nm = document.createElement("div");
          nm.className = "qh-name";
          var ten = TEN_LOAI_DAT[item.ma] || item.ma;
          nm.textContent = ten + " (" + item.ma + ")";
          var ar = document.createElement("div");
          ar.className = "qh-area";
          ar.textContent = formatNumber(item.dt, "m²");
          card.appendChild(sw);
          card.appendChild(nm);
          card.appendChild(ar);
          blockQh.appendChild(card);
        }
      } else if (dtqhNum > 0) {
        var card2 = document.createElement("div");
        card2.className = "qh-card";
        var sw2 = document.createElement("div");
        sw2.className = "qh-swatch";
        var nm2 = document.createElement("div");
        nm2.className = "qh-name";
        nm2.textContent = "Diện tích quy hoạch";
        var ar2 = document.createElement("div");
        ar2.className = "qh-area";
        ar2.textContent = formatNumber(dtqhNum, "m²");
        card2.appendChild(sw2);
        card2.appendChild(nm2);
        card2.appendChild(ar2);
        blockQh.appendChild(card2);
      } else {
        var card3 = document.createElement("div");
        card3.className = "qh-card";
        var nm3 = document.createElement("div");
        nm3.className = "qh-name";
        nm3.textContent = "Nằm trong vùng quy hoạch";
        card3.appendChild(nm3);
        blockQh.appendChild(card3);
      }

      // Không thêm dòng "Quy hoạch: xxx m²" ở khối thửa khi đã có Chi tiết quy hoạch
    }

            // Copy text
    function copyVal(val) {
      return isEmpty(val) ? "_" : String(val);
    }
    var qhCopy;
    if (!hasQH) {
      qhCopy = "Ngoài quy hoạch";
    } else if (qhItems.length > 0) {
      qhCopy = qhItems
        .map(function (it) {
          return (TEN_LOAI_DAT[it.ma] || it.ma) + " (" + it.ma + "): " + formatNumber(it.dt, "m²");
        })
        .join("; ");
    } else if (dtqhNum > 0) {
      qhCopy = "Diện tích quy hoạch: " + formatNumber(dtqhNum, "m²");
    } else {
      qhCopy = "Có quy hoạch";
    }
    lastInfoText = [
      "Tờ: " + copyVal(soTo),
      "Thửa: " + copyVal(soThua),
      "Diện tích: " + formatNumber(dt, "m²"),
      "Hiện trạng: " + copyVal(typeof htDisplay !== "undefined" ? htDisplay : ht),
      "Chủ sử dụng: " + copyVal(chu),
      "Địa chỉ: " + copyVal(diaChi),
      "Quy hoạch: " + qhCopy
    ].join("\n");

    $("#empty-state").style.display = "none";
    $("#info-content").classList.add("visible");
    $("#btn-copy").disabled = false;
    $("#btn-direction").disabled = !lastCenterLonLat;
    var panel = $("#info-panel");
    if (panel) panel.classList.add("has-content");
  }

  // ---------- search ----------
  function buildOwnerIndex() {
    ownerIndex = [];
    parcelIndex = [];
    var feats = parcelSource.getFeatures();
    var counts = {};
    for (var i = 0; i < feats.length; i++) {
      var f = feats[i];
      var n = f.get(F.chuSuDung);
      if (n) ownerIndex.push({ name: String(n), feature: f });
      var st = f.get(F.soTo);
      var sth = f.get(F.soThua);
      if (st != null && sth != null) {
        parcelIndex.push({
          key: String(st) + "_" + String(sth),
          label: "Tờ " + st + " · Thửa " + sth,
          feature: f
        });
      }
      if (st != null && st !== undefined && String(st).trim() !== "") {
        var sid = String(st);
        counts[sid] = (counts[sid] || 0) + 1;
      }
    }
    sheetStats = Object.keys(counts)
      .map(function (id) {
        return { id: id, count: counts[id] };
      })
      .sort(function (a, b) {
        var na = parseInt(a.id, 10);
        var nb = parseInt(b.id, 10);
        if (!isNaN(na) && !isNaN(nb)) return na - nb;
        return String(a.id).localeCompare(String(b.id));
      });
    renderSheetList("");
  }

  function refreshLayers() {
    if (parcelLayer) parcelLayer.changed();
    if (planningLayer) planningLayer.changed();
  }

  function renderSheetList(filter) {
    var box = $("#sheet-list");
    if (!box) return;
    box.innerHTML = "";
    var q = (filter || "").trim().toLowerCase();
    for (var i = 0; i < sheetStats.length; i++) {
      var item = sheetStats[i];
      if (q && String(item.id).toLowerCase().indexOf(q) === -1) continue;
      var lab = document.createElement("label");
      lab.className = "sheet-item";
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = !hiddenSheets[item.id];
      cb.dataset.sheet = item.id;
      cb.addEventListener("change", function () {
        var id = this.dataset.sheet;
        if (this.checked) delete hiddenSheets[id];
        else hiddenSheets[id] = true;
        refreshLayers();
      });
      var txt = document.createElement("span");
      txt.textContent = "Tờ " + item.id;
      var cnt = document.createElement("span");
      cnt.className = "cnt";
      cnt.textContent = item.count + " thửa";
      lab.appendChild(cb);
      lab.appendChild(txt);
      lab.appendChild(cnt);
      box.appendChild(lab);
    }
    if (!box.children.length) {
      box.innerHTML = '<div style="padding:8px;font-size:12px;color:#5a8a9e;text-align:center">Không có tờ phù hợp</div>';
    }
  }

  function onToThuaInput() {
    var q = $("#inp-tothua").value.trim().replace(/\s+/g, "").toLowerCase();
    var list = $("#suggest-tothua");
    if (list) list.innerHTML = "";
    var ownerList = $("#suggest-owner");
    if (ownerList) ownerList.innerHTML = "";
    if (q.length < 1 || !parcelIndex) return;
    var count = 0;
    for (var i = 0; i < parcelIndex.length && count < 15; i++) {
      var item = parcelIndex[i];
      if (item.key.indexOf(q) === 0 || item.key.replace("_", "").indexOf(q.replace(/[_\-\/.,]/g, "")) === 0) {
        var div = document.createElement("div");
        div.className = "suggest-item";
        div.textContent = item.label;
        var chu = item.feature.get(F.chuSuDung);
        if (chu) {
          var sm = document.createElement("small");
          sm.textContent = String(chu);
          div.appendChild(sm);
        }
        (function (feat, key) {
          div.addEventListener("click", function () {
            selectFeature(feat);
            list.innerHTML = "";
            $("#inp-tothua").value = key;
          });
        })(item.feature, item.key);
        list.appendChild(div);
        count++;
      }
    }
  }

  function searchToThua() {
    var raw = $("#inp-tothua").value.trim().replace(/\s+/g, "");
    if (!raw) {
      showToast("Vui lòng nhập số tờ_số thửa");
      return;
    }
    var parts = raw.split(/[_\-\/.,]/);
    if (parts.length < 2 || !/^\d+$/.test(parts[0]) || !/^\d+$/.test(parts[1])) {
      showToast("Định dạng: số tờ_số thửa (vd: 10_75)");
      return;
    }
    var soTo = parts[0];
    var soThua = parts[1];
    var feats = parcelSource.getFeatures();
    for (var i = 0; i < feats.length; i++) {
      var f = feats[i];
      if (String(f.get(F.soTo)) === soTo && String(f.get(F.soThua)) === soThua) {
        selectFeature(f);
        showToast("Đã tìm thấy thửa " + soTo + "/" + soThua);
        return;
      }
    }
    showToast("Không tìm thấy thửa " + soTo + "/" + soThua);
  }

  function searchCoord() {
    var x = parseFloat($("#inp-x").value.trim().replace(",", "."));
    var y = parseFloat($("#inp-y").value.trim().replace(",", "."));
    if (isNaN(x) || isNaN(y)) {
      showToast("Tọa độ không hợp lệ");
      return;
    }
    if (x < 100 || x > 110 || y < 8 || y > 24) {
      showToast("Tọa độ ngoài vùng Việt Nam");
      return;
    }
    var coord3857 = ol.proj.fromLonLat([x, y]);
    if (gpsMarker) map.removeOverlay(gpsMarker);
    var el = document.createElement("div");
    el.style.cssText =
      "width:14px;height:14px;border-radius:50%;background:#1a9fd1;border:2px solid #fff;box-shadow:0 0 6px rgba(0,0,0,0.4);";
    gpsMarker = new ol.Overlay({
      element: el,
      positioning: "center-center",
      position: coord3857
    });
    map.addOverlay(gpsMarker);
    map.getView().animate({
      center: coord3857,
      zoom: Math.max(map.getView().getZoom(), 17),
      duration: CFG.BAY_DEN_THUA_MUOT ? 400 : 0
    });
    var pixel = map.getPixelFromCoordinate(coord3857);
    var feature = map.forEachFeatureAtPixel(
      pixel,
      function (f) {
        return f;
      },
      {
        layerFilter: function (l) {
          return l === parcelLayer;
        }
      }
    );
    if (feature) selectFeature(feature);
    else showToast("Đã ghim tọa độ");
  }

  function onOwnerInput() {
    var q = $("#inp-owner").value.trim().toLowerCase();
    var list = $("#suggest-owner");
    list.innerHTML = "";
    var st = $("#suggest-tothua");
    if (st) st.innerHTML = "";
    if (q.length < 2 || !ownerIndex) return;
    var count = 0;
    for (var i = 0; i < ownerIndex.length && count < 20; i++) {
      var item = ownerIndex[i];
      if (item.name.toLowerCase().indexOf(q) !== -1) {
        var div = document.createElement("div");
        div.className = "suggest-item";
        div.textContent = item.name;
        (function (feat) {
          div.addEventListener("click", function () {
            selectFeature(feat);
            list.innerHTML = "";
            $("#inp-owner").value = feat.get(F.chuSuDung) || "";
          });
        })(item.feature);
        list.appendChild(div);
        count++;
      }
    }
  }

  // ---------- measure ----------
  function formatLength(line) {
    var length = ol.sphere.getLength(line);
    return length > 1000
      ? (length / 1000).toFixed(2) + " km"
      : length.toFixed(1) + " m";
  }

  function formatArea(polygon) {
    var area = ol.sphere.getArea(polygon);
    var peri = 0;
    var coords = polygon.getLinearRing(0).getCoordinates();
    for (var i = 0; i < coords.length - 1; i++) {
      peri += ol.sphere.getDistance(
        ol.proj.toLonLat(coords[i]),
        ol.proj.toLonLat(coords[i + 1])
      );
    }
    var areaStr =
      area > 10000
        ? (area / 10000).toFixed(2) + " ha"
        : area.toFixed(1) + " m²";
    var periStr =
      peri > 1000 ? (peri / 1000).toFixed(2) + " km" : peri.toFixed(1) + " m";
    return areaStr + " · chu vi " + periStr;
  }

  function startMeasure(type) {
    stopMeasure();
    measureType = type;
    $$(".tool-btn[data-tool]").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-tool") === type);
    });
    measureDraw = new ol.interaction.Draw({
      source: measureSource,
      type: type,
      style: new ol.style.Style({
        fill: new ol.style.Fill({ color: "rgba(59,184,224,0.15)" }),
        stroke: new ol.style.Stroke({
          color: "#1a9fd1",
          width: 2,
          lineDash: [8, 6]
        }),
        image: new ol.style.Circle({
          radius: 5,
          fill: new ol.style.Fill({ color: "#1a9fd1" })
        })
      })
    });
    map.addInteraction(measureDraw);
    var resultEl = $("#measure-result");
    resultEl.classList.add("visible");
    resultEl.textContent =
      type === "LineString"
        ? "Bấm các điểm để đo khoảng cách..."
        : "Bấm các điểm để đo diện tích...";

    measureDraw.on("drawstart", function (evt) {
      measureSource.clear();
      var sketch = evt.feature;
      measureListener = sketch.getGeometry().on("change", function (e) {
        var geom = e.target;
        if (geom.getType() === "LineString") {
          resultEl.textContent = "Chiều dài: " + formatLength(geom);
        } else if (geom.getType() === "Polygon") {
          resultEl.textContent = "Diện tích: " + formatArea(geom);
        }
      });
    });
    measureDraw.on("drawend", function (evt) {
      var geom = evt.feature.getGeometry();
      if (geom.getType() === "LineString") {
        resultEl.textContent = "Chiều dài: " + formatLength(geom);
      } else {
        resultEl.textContent = "Diện tích: " + formatArea(geom);
      }
      if (measureListener) {
        ol.Observable.unByKey(measureListener);
        measureListener = null;
      }
    });
  }

  function stopMeasure() {
    if (measureDraw) {
      map.removeInteraction(measureDraw);
      measureDraw = null;
    }
    if (measureListener) {
      ol.Observable.unByKey(measureListener);
      measureListener = null;
    }
    measureType = null;
    $$(".tool-btn[data-tool]").forEach(function (b) {
      b.classList.remove("active");
    });
  }

  function clearMeasure() {
    stopMeasure();
    measureSource.clear();
    $("#measure-result").classList.remove("visible");
  }

  function locateMe() {
    if (!navigator.geolocation) {
      showToast("Trình duyệt không hỗ trợ định vị");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        var coord = ol.proj.fromLonLat([
          pos.coords.longitude,
          pos.coords.latitude
        ]);
        if (gpsMarker) map.removeOverlay(gpsMarker);
        var el = document.createElement("div");
        el.style.cssText =
          "width:16px;height:16px;border-radius:50%;background:#1a9fd1;border:3px solid #fff;box-shadow:0 0 0 6px rgba(59,184,224,0.3);";
        gpsMarker = new ol.Overlay({
          element: el,
          positioning: "center-center",
          position: coord
        });
        map.addOverlay(gpsMarker);
        map.getView().animate({
          center: coord,
          zoom: 17,
          duration: CFG.BAY_DEN_THUA_MUOT ? 400 : 0
        });
      },
      function () {
        showToast("Không lấy được vị trí GPS");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function resetExtent() {
    map.getView().animate({
      center: ol.proj.fromLonLat([CFG.TAM_BAN_DO[1], CFG.TAM_BAN_DO[0]]),
      zoom: CFG.ZOOM_MAC_DINH,
      duration: CFG.BAY_DEN_THUA_MUOT ? 300 : 0
    });
  }

  // ---------- tabs / UI ----------
  function setTab(tab) {
    currentTab = tab;
    $$(".tabs button").forEach(function (b) {
      b.classList.toggle("active", b.dataset.tab === tab);
    });
    var boxTo = $("#search-tothua");
    var boxOwn = $("#search-owner");
    if (boxTo) {
      boxTo.style.display = tab === "tothua" ? "" : "none";
      boxTo.classList.toggle("active", tab === "tothua");
    }
    if (boxOwn) {
      boxOwn.style.display = tab === "owner" ? "" : "none";
      boxOwn.classList.toggle("active", tab === "owner");
    }
    $("#search-coord").classList.toggle("visible", tab === "coord");
    var st = $("#suggest-tothua");
    var so = $("#suggest-owner");
    if (st) st.innerHTML = "";
    if (so) so.innerHTML = "";
  }

  function bindUI() {
    $("#disclaimer").textContent = CFG.DISCLAIMER;

    $$(".tabs button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setTab(btn.dataset.tab);
      });
    });

    $("#btn-search-go").addEventListener("click", function () {
      if (currentTab === "tothua") searchToThua();
      else if (currentTab === "coord") searchCoord();
    });

    $("#inp-tothua").addEventListener("keydown", function (e) {
      if (e.key === "Enter") searchToThua();
    });
    $("#inp-x").addEventListener("keydown", function (e) {
      if (e.key === "Enter") searchCoord();
    });
    $("#inp-y").addEventListener("keydown", function (e) {
      if (e.key === "Enter") searchCoord();
    });
    $("#inp-owner").addEventListener("input", onOwnerInput);
    $("#inp-tothua").addEventListener("input", onToThuaInput);

    $("#btn-zoom-in").addEventListener("click", function () {
      map.getView().animate({
        zoom: map.getView().getZoom() + 1,
        duration: 200
      });
    });
    $("#btn-zoom-out").addEventListener("click", function () {
      map.getView().animate({
        zoom: map.getView().getZoom() - 1,
        duration: 200
      });
    });
    $("#btn-locate").addEventListener("click", locateMe);
    $("#btn-reset").addEventListener("click", resetExtent);
    $("#btn-measure-line").addEventListener("click", function () {
      if (measureType === "LineString") clearMeasure();
      else startMeasure("LineString");
    });
    $("#btn-measure-area").addEventListener("click", function () {
      if (measureType === "Polygon") clearMeasure();
      else startMeasure("Polygon");
    });
    $("#btn-measure-clear").addEventListener("click", clearMeasure);

    $("#btn-layers").addEventListener("click", function (e) {
      e.stopPropagation();
      $("#layer-popover").classList.toggle("open");
      this.classList.toggle("active");
    });
    var layerPop = $("#layer-popover");
    if (layerPop) {
      layerPop.addEventListener("click", function (e) {
        e.stopPropagation();
      });
    }
    document.addEventListener("click", function (e) {
      var pop = $("#layer-popover");
      var btn = $("#btn-layers");
      var toolbar = document.querySelector(".toolbar");
      var searchBar = document.querySelector(".search-bar");
      var t = e.target;
      if (pop && pop.classList.contains("open")) {
        if (btn && (btn === t || btn.contains(t))) return;
        if (pop.contains(t)) return;
        pop.classList.remove("open");
        if (btn) btn.classList.remove("active");
      }
      // Đóng gợi ý khi bấm ra ngoài ô tìm
      if (searchBar && !searchBar.contains(t)) {
        var st = $("#suggest-tothua");
        var so = $("#suggest-owner");
        if (st) st.innerHTML = "";
        if (so) so.innerHTML = "";
      }
    });

    $("#chk-parcel").addEventListener("change", function () {
      parcelLayer.setVisible(this.checked);
    });
    $("#opacity-parcel").addEventListener("input", function () {
      parcelLayer.setOpacity(this.value / 100);
    });
    var chkPlan = $("#chk-planning");
    if (chkPlan) {
      chkPlan.addEventListener("change", function () {
        planningLayer.setVisible(this.checked);
      });
    }
    var opPlan = $("#opacity-planning");
    if (opPlan) {
      opPlan.addEventListener("input", function () {
        planningLayer.setOpacity(this.value / 100);
      });
    }

    var btnAll = $("#btn-sheet-all");
    var btnNone = $("#btn-sheet-none");
    var sheetFilter = $("#sheet-filter");
    if (btnAll) {
      btnAll.addEventListener("click", function (e) {
        e.stopPropagation();
        hiddenSheets = {};
        renderSheetList(sheetFilter ? sheetFilter.value : "");
        refreshLayers();
      });
    }
    if (btnNone) {
      btnNone.addEventListener("click", function (e) {
        e.stopPropagation();
        for (var i = 0; i < sheetStats.length; i++) {
          hiddenSheets[sheetStats[i].id] = true;
        }
        renderSheetList(sheetFilter ? sheetFilter.value : "");
        refreshLayers();
      });
    }
    if (sheetFilter) {
      sheetFilter.addEventListener("input", function () {
        renderSheetList(this.value);
      });
      sheetFilter.addEventListener("click", function (e) {
        e.stopPropagation();
      });
    }

    $$(".basemap-row button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var key = btn.dataset.base;
        Object.keys(baseLayers).forEach(function (k) {
          // "none" = tắt hết → nền trắng
          baseLayers[k].setVisible(key !== "none" && k === key);
        });
        $$(".basemap-row button").forEach(function (b) {
          b.classList.toggle("active", b === btn);
        });
      });
    });

    
    var btnClose = $("#btn-info-close");
    if (btnClose) {
      btnClose.addEventListener("click", function (e) {
        e.stopPropagation();
        hideInfoPanel();
        clearSelect();
      });
    }

    $("#btn-copy").addEventListener("click", function () {
      if (!lastInfoText) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(lastInfoText).then(
          function () {
            showToast("Đã sao chép thông tin");
          },
          function () {
            showToast("Không sao chép được");
          }
        );
      } else {
        showToast("Trình duyệt không hỗ trợ sao chép");
      }
    });

    $("#btn-direction").addEventListener("click", function () {
      if (!lastCenterLonLat) return;
      var url =
        "https://www.google.com/maps/dir/?api=1&destination=" +
        lastCenterLonLat[1] +
        "," +
        lastCenterLonLat[0];
      window.open(url, "_blank", "noopener,noreferrer");
    });

    setTab("tothua");
  }

  function boot() {
    if (typeof ol === "undefined") {
      alert("Không tải được OpenLayers");
      return;
    }
    if (typeof json_Aggregated_0 === "undefined") {
      alert("Không tải được dữ liệu thửa đất");
      return;
    }
    if (typeof styleAggregated === "undefined") {
      alert("Không tải được style");
      return;
    }
    if (typeof json_VungNhutTao_1 === "undefined") {
      console.warn("Không tải được lớp quy hoạch VungNhutTao_2 – chỉ hiển thị thửa đất");
    }
    bindUI();
    initMap();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
