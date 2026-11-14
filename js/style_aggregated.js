/**
 * Style thửa đất giữ nguyên màu từ QGIS (phân loại theo MDSD).
 * Lớp quy hoạch: cùng bảng màu QGIS nhưng đậm hơn để dễ phân biệt.
 */
(function (global) {
  "use strict";

  // Màu thửa đất — đúng theo Aggregated_0_style.js (QGIS export)
  var COLOR_MAP = {
    "1190": { stroke: "rgba(35,35,35,1.0)", fill: "rgba(202,222,124,1.0)" },
    BCS: { stroke: "rgba(35,35,35,1.0)", fill: "rgba(255,255,254,1.0)" },
    BHK: { stroke: "rgba(35,35,35,1.0)", fill: "rgba(255,240,180,1.0)" },
    CLN: { stroke: "rgba(35,35,35,1.0)", fill: "rgba(255,210,160,1.0)" },
    DBV: { stroke: "rgba(35,35,35,1.0)", fill: "rgba(255,170,160,1.0)" },
    DDT: { stroke: "rgba(35,35,35,1.0)", fill: "rgba(255,170,160,1.0)" },
    DGD: { stroke: "rgba(35,35,35,1.0)", fill: "rgba(255,170,160,1.0)" },
    DGT: { stroke: "rgba(35,35,35,1.0)", fill: "rgba(255,170,50,1.0)" },
    DNL: { stroke: "rgba(35,35,35,1.0)", fill: "rgba(255,170,160,1.0)" },
    DSH: { stroke: "rgba(35,35,35,1.0)", fill: "rgba(255,170,160,1.0)" },
    DTL: { stroke: "rgba(35,35,35,1.0)", fill: "rgba(170,255,255,1.0)" },
    DVH: { stroke: "rgba(35,35,35,1.0)", fill: "rgba(255,170,160,1.0)" },
    DYT: { stroke: "rgba(35,35,35,1.0)", fill: "rgba(255,170,160,1.0)" },
    HHK: { stroke: "rgba(35,35,35,1.0)", fill: "rgba(118,215,38,1.0)" },
    HNK: { stroke: "rgba(35,35,35,1.0)", fill: "rgba(255,240,180,1.0)" },
    "HNK+ONT": { stroke: "rgba(35,35,35,1.0)", fill: "rgba(255,240,180,1.0)" },
    LNK: { stroke: "rgba(35,35,35,1.0)", fill: "rgba(255,215,170,1.0)" },
    LUA: { stroke: "rgba(35,35,35,1.0)", fill: "rgba(255,252,130,1.0)" },
    LUC: { stroke: "rgba(35,35,35,1.0)", fill: "rgba(255,252,140,1.0)" },
    "LUC+ONT": { stroke: "rgba(35,35,35,1.0)", fill: "rgba(255,252,140,1.0)" },
    MNC: { stroke: "rgba(35,35,35,1.0)", fill: "rgba(180,255,255,1.0)" },
    NKH: { stroke: "rgba(35,35,35,1.0)", fill: "rgba(245,255,180,1.0)" },
    NTD: { stroke: "rgba(35,35,35,1.0)", fill: "rgba(210,210,210,1.0)" },
    NTS: { stroke: "rgba(35,35,35,1.0)", fill: "rgba(170,255,255,1.0)" },
    ONT: { stroke: "rgba(35,35,35,1.0)", fill: "rgba(255,208,255,1.0)" },
    "ONT+LNK": { stroke: "rgba(35,35,35,1.0)", fill: "rgba(255,208,255,1.0)" },
    "ONT+LUC": { stroke: "rgba(35,35,35,1.0)", fill: "rgba(255,208,255,1.0)" },
    SKC: { stroke: "rgba(35,35,35,1.0)", fill: "rgba(250,170,160,1.0)" },
    SON: { stroke: "rgba(35,35,35,1.0)", fill: "rgba(160,255,255,1.0)" },
    TIN: { stroke: "rgba(35,35,35,1.0)", fill: "rgba(255,170,160,1.0)" },
    TMD: { stroke: "rgba(35,35,35,1.0)", fill: "rgba(250,170,160,1.0)" },
    TON: { stroke: "rgba(35,35,35,1.0)", fill: "rgba(255,170,160,1.0)" },
    TSC: { stroke: "rgba(35,35,35,1.0)", fill: "rgba(255,170,160,1.0)" },
    TSN: { stroke: "rgba(35,35,35,1.0)", fill: "rgba(170,255,255,1.0)" }
  };

  var DEFAULT_COLOR = {
    stroke: "rgba(35,35,35,1.0)",
    fill: "rgba(29,224,203,1.0)"
  };

  var SELECT_STROKE = "rgba(239,68,68,1.0)";
  var HOVER_STROKE = "rgba(14,165,233,1.0)";

  function makeStyle(fill, stroke, width) {
    return new ol.style.Style({
      stroke: new ol.style.Stroke({
        color: stroke,
        width: width || 0.988,
        lineCap: "butt",
        lineJoin: "miter"
      }),
      fill: new ol.style.Fill({ color: fill })
    });
  }

  // Xám nhạt nhất — thửa thiếu hiện trạng (không lộ rõ)
  var MISSING_HT_COLOR = {
    stroke: "rgba(35,35,35,0.35)",
    fill: "rgba(235,235,235,1.0)"
  };

  function styleAggregated(feature, resolution) {
    var value = feature.get("MDSD");
    var ht = feature.get("HienTrang") || feature.get("Hientrang") || "";
    // Nếu thiếu MDSD, lấy mã trong ngoặc của HienTrang: "… (ONT)"
    if (value === null || value === undefined || String(value).trim() === "") {
      var m = String(ht).match(/\(([A-Z0-9+]+)\)\s*$/);
      if (m) value = m[1];
    }
    // Thiếu cả MDSD lẫn HienTrang → xám nhạt
    var missingHT =
      (value === null || value === undefined || String(value).trim() === "") &&
      (ht === null || ht === undefined || String(ht).trim() === "" || String(ht) === "None");
    if (missingHT) {
      var colorsMiss = MISSING_HT_COLOR;
      if (feature.get("_selected")) {
        return [
          makeStyle(colorsMiss.fill, SELECT_STROKE, 3.5),
          makeStyle(colorsMiss.fill, "rgba(239,68,68,0.35)", 8)
        ];
      }
      if (feature.get("_hover")) {
        return [makeStyle(colorsMiss.fill, HOVER_STROKE, 2.2)];
      }
      return [makeStyle(colorsMiss.fill, colorsMiss.stroke, 0.8)];
    }
    var key = value !== null && value !== undefined ? String(value).trim() : "default";
    var colors = COLOR_MAP[key] || DEFAULT_COLOR;

    if (feature.get("_selected")) {
      return [
        makeStyle(colors.fill, SELECT_STROKE, 3.5),
        makeStyle(colors.fill, "rgba(239,68,68,0.35)", 8)
      ];
    }
    if (feature.get("_hover")) {
      return [makeStyle(colors.fill, HOVER_STROKE, 2.2)];
    }
    return [makeStyle(colors.fill, colors.stroke, 0.988)];
  }

  // Màu lớp quy hoạch — đúng bản gốc QGIS (VungNhutTao_1_style.js)
  var PLANNING_COLOR_MAP = {
    CAN: "rgba(255,80,70,1.0)",
    CQP: "rgba(255,100,80,1.0)",
    DCH: "rgba(255,170,160,1.0)",
    DGD: "rgba(255,170,160,1.0)",
    DGT: "rgba(255,170,50,1.0)",
    DKV: "rgba(255,170,160,1.0)",
    DTL: "rgba(170,255,255,1.0)",
    DTT: "rgba(255,170,160,1.0)",
    DVH: "rgba(255,170,160,1.0)",
    NKH: "rgba(245,255,180,1.0)",
    NTD: "rgba(210,210,210,1.0)",
    ONT: "rgba(255,208,255,1.0)",
    SKC: "rgba(250,170,160,1.0)",
    SKK: "rgba(250,170,160,1.0)",
    SKN: "rgba(250,170,160,1.0)",
    TMD: "rgba(250,170,160,1.0)",
    TON: "rgba(255,170,160,1.0)"
  };
  var PLANNING_DEFAULT = "rgba(255,170,160,1.0)";

  function stylePlanning(feature) {
    var madat = feature.get("MadatQH");
    if (
      madat === null ||
      madat === undefined ||
      String(madat).trim() === "" ||
      String(madat) === "None" ||
      String(madat) === "null"
    ) {
      return null;
    }
    var key = String(madat).trim().toUpperCase();
    var fill = PLANNING_COLOR_MAP[key] || PLANNING_DEFAULT;
    return [
      new ol.style.Style({
        fill: new ol.style.Fill({ color: fill }),
        stroke: new ol.style.Stroke({
          color: "rgba(35,35,35,1.0)",
          width: 0.988,
          lineCap: "butt",
          lineJoin: "miter"
        })
      })
    ];
  }

  global.styleAggregated = styleAggregated;
  global.stylePlanning = stylePlanning;
  global.PARCEL_COLOR_MAP = COLOR_MAP;
})(typeof window !== "undefined" ? window : this);
