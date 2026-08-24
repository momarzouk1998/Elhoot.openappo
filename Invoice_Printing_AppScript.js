// ====== الإعدادات الأساسية (النزلاوي) ======
var APP_ID = "b8033f0f-4f66-4166-a39a-efda39f7faab";
var ACCESS_KEY = "V2-SQAdE-NCoT1-6BUNV-UqOfw-HK3pa-OhlnS-owrO9-Q36CZ";

// أسماء الجداول كما هي مسجلة في AppSheet
var HEADER_TABLE = "Orders";
var DETAILS_TABLE = "OrderDetails";

// الدالة الرئيسية
function doGet(e) {
  var orderId = e.parameter.orderId;
  var storeId = e.parameter.storeId; // المعرف الجديد لطباعة جرد المخزن (سواء مخزن محدد أو "all")

  // إذا تم إرسال معرف المخزن، نقوم بطباعة جرد المخزن
  if (storeId) {
    try {
      var htmlContent;
      var storeHeader = null;

      if (storeId.toLowerCase() === "all") {
        // 1. جلب بيانات كل المخازن
        var allStores = fetchAppSheetData("Stores", "Filter(\"Stores\", true)");
        // 2. جلب جرد كل الأصناف
        var allInventory = fetchAppSheetData("Inventory", "Filter(\"Inventory\", true)");

        // 3. بناء صفحة الجرد الشامل لكل المخازن
        htmlContent = buildAllStoresHtml(allStores, allInventory);
      } else {
        // 1. جلب بيانات مخزن محدد
        var storeSelector = "Filter(\"Stores\", [Store_Id S] = '" + storeId + "')";
        var storeData = fetchAppSheetData("Stores", storeSelector);

        if (!storeData || storeData.length === 0) {
          return HtmlService.createHtmlOutput("<h3 style='direction: rtl; font-family: Tahoma; text-align:center; padding: 50px;'>خطأ: المخزن غير موجود.</h3>");
        }
        storeHeader = storeData[0];

        // 2. جلب جرد الأصناف في هذا المخزن المحدد
        var inventorySelector = "Filter(\"Inventory\", [Store_Id I] = '" + storeId + "')";
        var inventoryDetails = fetchAppSheetData("Inventory", inventorySelector);

        // 3. بناء صفحة جرد المخزن الواحد
        htmlContent = buildStoreHtml(storeHeader, inventoryDetails);
      }

      var pageTitle = (storeId.toLowerCase() === "all") ? 'جرد جميع المخازن' : ('جرد مخزن - ' + (storeHeader ? storeHeader["Store_Name S"] : storeId));

      return HtmlService.createHtmlOutput(htmlContent)
        .setTitle(pageTitle)
        .addMetaTag('viewport', 'width=device-width, initial-scale=1');

    } catch (error) {
      return HtmlService.createHtmlOutput("<h3 style='direction: rtl; font-family: Tahoma; text-align:center; padding: 50px;'>حدث خطأ أثناء جلب بيانات المخازن: </h3><p style='text-align:center;'>" + error.message + "</p>");
    }
  }

  // كشف حساب العميل
  var customerId = e.parameter.customerId;
  if (customerId) {
    return generateCustomerStatement(customerId);
  }

  // كشف حساب المورد
  var supplierId = e.parameter.supplierId;
  if (supplierId) {
    return generateSupplierStatement(supplierId);
  }

  // إذا تم إرسال رقم الفاتورة، نقوم بطباعة الفاتورة
  if (!orderId) {
    return HtmlService.createHtmlOutput("<h3 style='direction: rtl; font-family: Tahoma; text-align:center; padding: 50px;'>خطأ: المعرف غير صحيح أو لم يتم إرسال أي معرف (فاتورة/جرد/عميل/مورد).</h3>");
  }

  try {
    // جلب بيانات الفاتورة
    var headerSelector = "Filter(\"" + HEADER_TABLE + "\", [Order_Id O] = '" + orderId + "')";
    var headerData = fetchAppSheetData(HEADER_TABLE, headerSelector);

    if (!headerData || headerData.length === 0) {
      return HtmlService.createHtmlOutput("<h3 style='direction: rtl; font-family: Tahoma; text-align:center; padding: 50px;'>خطأ: الفاتورة غير موجودة. تأكد من تطابق الرقم.</h3>");
    }
    var invoiceHeader = headerData[0];

    // جلب بيانات الأصناف
    var detailsSelector = "Filter(\"" + DETAILS_TABLE + "\", [Orderid OD] = '" + orderId + "')";
    var invoiceDetails = fetchAppSheetData(DETAILS_TABLE, detailsSelector);

    // بناء HTML الفاتورة (قالب RTX معدل للنزلاوي)
    var htmlContent = buildInvoiceHtml(invoiceHeader, invoiceDetails);

    return HtmlService.createHtmlOutput(htmlContent)
      .setTitle('فاتورة رقم - ' + (invoiceHeader["Order Number O"] || orderId))
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');

  } catch (error) {
    return HtmlService.createHtmlOutput("<h3 style='direction: rtl; font-family: Tahoma; text-align:center; padding: 50px;'>حدث خطأ: </h3><p style='text-align:center;'>" + error.message + "</p>");
  }
}

function fetchAppSheetData(tableName, selector, attempt) {
  attempt = attempt || 1;
  var url = "https://api.appsheet.com/api/v2/apps/" + APP_ID + "/tables/" + encodeURIComponent(tableName) + "/Action";
  var payload = {
    "Action": "Find",
    "Properties": {
      "Locale": "ar-EG",
      "Selector": selector
    },
    "Rows": []
  };

  var options = {
    "method": "post",
    "contentType": "application/json",
    "headers": {
      "ApplicationAccessKey": ACCESS_KEY
    },
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true
  };

  var response = UrlFetchApp.fetch(url, options);
  var responseText = response.getContentText();

  // معالجة خطأ 429 (Too Many Requests)
  if (response.getResponseCode() === 429) {
    if (attempt <= 3) {
      Utilities.sleep(1000 * attempt); // الانتظار ثانية ثم المحاولة مجدداً
      return fetchAppSheetData(tableName, selector, attempt + 1);
    } else {
      throw new Error("السيرفر مشغول حالياً (تم تجاوز الحد المسموح). يرجى المحاولة بعد قليل.");
    }
  }

  if (response.getResponseCode() !== 200) {
    throw new Error("API Error (" + response.getResponseCode() + "): " + responseText);
  }

  try {
    var jsonResponse = JSON.parse(responseText);
    return jsonResponse;
  } catch (parseError) {
    throw new Error("خطأ في قراءة استجابة AppSheet! السيرفر لم يرسل بيانات صحيحة (JSON). محتوى الاستجابة كان: " + responseText.substring(0, 150));
  }
}

// دالة دمج كود الفاتورة المأخوذ من تصميم RTX
function buildInvoiceHtml(header, details) {
  // بيانات أساسية
  var orderNumber = header["Order Number O"] || "غير محدد";
  var orderDate = header["Order_Date O"] || "غير محدد";
  var customerName = header["Customer_Name O"] || "غير محدد";
  var employeeName = header["Salesperson O"] || "غير محدد";
  var invoiceType = header["Invoice_Type O"] || "عادية";

  // التحقق مما إذا كانت الفاتورة ضريبية وتجهيز بيانات الضرائب للفوتر
  var isTax = invoiceType.indexOf("ضريبية") !== -1;
  var taxInfoHtml = "";
  if (isTax) {
    taxInfoHtml = `
      <p style="margin-top: 8px; font-size: 0.9em; color: #444; border-top: 1px dashed #ddd; padding-top: 8px; line-height: 1.6;">
        ⚖️ التسجيل الضريبي: <span style="font-weight: bold; color: #d32f2f;">634 - 128 - 467</span> &nbsp;&nbsp;&nbsp;&nbsp; العنوان الضريبي: <span style="font-weight: bold; color: #333;">الربع - النزلة - يوسف الصديق - الفيوم</span>
      </p>
    `;
  }

  var preDiscount = parseFloat(header["Pre Discount O"]) || 0;
  var discountValue = parseFloat(header["Discount Value O"]) || 0;
  var afterDiscount = parseFloat(header["After Discount O"]) || 0;

  // صياغة صفوف الأصناف
  var itemsHtml = "";
  for (var i = 0; i < details.length; i++) {
    var item = details[i];
    itemsHtml += `
      <tr>
        <td>${i + 1}</td>
        <td>${item["Product_Name OD"] || ""}</td>
        <td>${item["Quantity OD"] || "0"}</td>
        <td>${item["Unit_Price OD"] || "0"}</td>
        <td>${item["Item_Total OD"] || "0"}</td>
      </tr>
    `;
  }

  // صياغة المجموع النهائي (الخصم)
  var totalsHtml = "";
  if (discountValue > 0) {
    totalsHtml = `
      <table class="totals-table">
        <tr>
          <td>
            <div class="label">قبل الخصم</div>
            <div class="value">${Number.isInteger(preDiscount) ? preDiscount : preDiscount.toFixed(2)}</div>
          </td>
          <td class="discount-cell">
            <div class="label">قيمة الخصم</div>
            <div class="value">${Number.isInteger(discountValue) ? discountValue : discountValue.toFixed(2)}</div>
          </td>
          <td class="final-cell">
            <div class="label">بعد الخصم</div>
            <div class="value">${Number.isInteger(afterDiscount) ? afterDiscount : afterDiscount.toFixed(2)}</div>
          </td>
        </tr>
      </table>
    `;
  } else {
    totalsHtml = `
      <table class="totals-table">
        <tr>
          <td class="final-cell">
            <div class="label">الإجمالي المطلوب</div>
            <div class="value" style="font-size: 1.5em;">${Number.isInteger(afterDiscount) ? afterDiscount : afterDiscount.toFixed(2)}</div>
          </td>
        </tr>
      </table>
    `;
  }

  var html = `
<!DOCTYPE html>
<html dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>فاتورة معرض النزلاوي</title>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body { font-family: 'Segoe UI', Tahoma, sans-serif; background: #f0f2f5; padding: 15px; direction: rtl; }
    .invoice-wrapper { max-width: 600px; margin: 1rem auto; }
    .container { background: white; box-shadow: 0 10px 40px rgba(0,0,0,0.1); border-radius: 12px; overflow: hidden; }
    
    .header { background: linear-gradient(135deg, #677077, #5c646b); color: white; padding: 20px; border-bottom: 4px solid #f56226; display: flex; align-items: center; justify-content: space-between; position: relative; }
    .logo { width: 90px; height: 90px; flex-shrink: 0; display:flex; align-items:center; justify-content:center; background:#fff; border-radius:12px; box-shadow: 0 4px 10px rgba(0,0,0,0.2); overflow: hidden; border: 2px solid #f56226; padding: 2px; }
    .logo img { width: 100%; height: 100%; object-fit: contain; }
    .company-info { flex-grow: 1; text-align: center; margin-right: 20px; }
    .company-info h1 { color: #ffffff; font-size: 1.9em; margin-bottom: 5px; font-weight: 800; text-shadow: 1px 1px 2px rgba(0,0,0,0.3); }
    .company-info .subtitle { color: rgba(255,255,255,0.95); font-size: 1em; font-weight: 500; }
    
    .invoice-card { background: #fff; margin: -15px 20px 15px 20px; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border: 1px solid #eee; position: relative; z-index: 2; overflow: hidden;}
    .invoice-type-ribbon { background: #f56226; color: white; text-align: center; font-weight: 800; font-size: 1.1em; padding: 8px; text-shadow: 1px 1px 1px rgba(0,0,0,0.2); }
    .invoice-info-grid { padding: 15px; }
    .invoice-info-grid table { width: 100%; border-collapse: separate; border-spacing: 0 10px; }
    .invoice-info-grid td { width: 50%; vertical-align: middle; }
    .info-label { color: #888; font-size: 0.85em; display: inline-block; width: 80px; }
    .info-value { color: #677077; font-weight: bold; font-size: 1em; }
    
    .content { padding: 0 20px 20px 20px; }
    .invoice-details table { width: 100%; border-collapse: collapse; margin-bottom: 10px; font-size: 0.85em; box-shadow: 0 2px 8px rgba(0,0,0,0.02); }
    .invoice-details th { background: #677077; color: white; padding: 10px; font-weight: 600; text-align: center; border: 1px solid #ddd; border-bottom: 3px solid #f56226; }
    .invoice-details td { padding: 8px; text-align: center; border: 1px solid #ddd; }
    .invoice-details tr:nth-child(even) { background-color: #f8fbfd; }
    
    .totals-table { width: 100%; border-collapse: collapse; background: #fff; border: 2px solid #ddd; display: table; margin-top:15px; box-shadow: 0 2px 8px rgba(0,0,0,0.02); }
    .totals-table td { padding: 12px; text-align: center; border: 1px solid #ddd; width: 33.33%; }
    .totals-table .label { font-size: 0.9em; color: #666; font-weight: 600; margin-bottom: 5px; }
    .totals-table .value { font-size: 1.3em; font-weight: bold; color: #f56226; }
    .totals-table .discount-cell { background: #fff3cd; }
    .totals-table .discount-cell .label, .totals-table .discount-cell .value { color: #856404; }
    .totals-table .final-cell { background: #ffffffff; border: 2px solid #f56226; }
    .totals-table .final-cell .label { color: #f56226; }
    .totals-table .final-cell .value { color: #d32f2f; font-size:1.6em; }
    
    .actions-container { padding: 1.5rem; text-align: center; display: flex; flex-wrap: wrap; gap: 1rem; justify-content: center; align-items: center; }
    .print-button { background: linear-gradient(135deg, #f56226, #d9531e); color: white; border: none; padding: 0.7rem 2rem; font-size: 1.1rem; font-weight: 700; cursor: pointer; border-radius: 40px; box-shadow: 0 4px 10px rgba(245, 98, 38, 0.3); }
    .print-normal-button { background: linear-gradient(135deg, #6c757d, #5a6268); color: white; border: none; padding: 0.7rem 2rem; font-size: 1.1rem; font-weight: 700; cursor: pointer; border-radius: 40px; }
    .btn-download-pdf { background: linear-gradient(135deg, #28a745, #20c997); color: white; border: none; padding: 0.7rem 2rem; font-size: 1.1rem; font-weight: 700; cursor: pointer; border-radius: 40px; }
    
    .footer { background: #f8f9fa; padding: 15px; text-align: center; color: #666; border-top: 1px solid #ddd; font-size: 0.85em; font-weight:500; }
    
    /* ميديا الطباعة كاشير */
    @media print {
      body.cashier-print { background: white; padding: 0; font-size: 12px; color: #000; }
      body.cashier-print .container { max-width: 80mm; width: 80mm; margin: 0; box-shadow: none; border: none; }
      body.cashier-print .header { padding: 10px; padding-bottom:5px; border-bottom: 2px solid #000; background: #000000 !important; display:block; text-align:center;}
      body.cashier-print .logo { width: 50px; height: 50px; margin: 0 auto 5px auto; border: 1px solid #000; box-shadow:none;}
      body.cashier-print .company-info { margin:0; }
      body.cashier-print .company-info h1 { font-size: 1.2em; color: white !important; text-shadow:none;}
      body.cashier-print .company-info .subtitle { font-size: 0.8em; }
      body.cashier-print .tax-info-section { display: none !important; }
      body.cashier-print .content { padding: 5px; }
      body.cashier-print .invoice-details th { background: #000000 !important; color: #fff !important; font-size: 0.8em; border: 1px solid #000; border-bottom:none;}
      body.cashier-print .invoice-details td { border: 1px solid #000; padding: 2px; }
      body.cashier-print .totals-table { border: 2px solid #000; box-shadow:none; margin-top: 5px;}
      body.cashier-print .totals-table td { border: 1px solid #000; padding: 4px; }
      body.cashier-print .totals-table .value { color: #000; font-size: 1.1em;}
      body.cashier-print .totals-table .final-cell { background: #fff !important; border: 2px solid #000; }
      body.cashier-print .totals-table .final-cell .value { color: #000; font-size:1.2em;}
      body.cashier-print .actions-container { display: none; }
      body.cashier-print .footer { background: transparent !important; border-top: 1px dashed #000 !important; padding: 10px 0 !important; font-size: 0.8em !important; color: #000 !important; text-align: center !important; }
      body.cashier-print .footer p { color: #000 !important; margin-bottom: 5px !important; font-size: 0.85em !important; line-height: 1.3 !important; }
      body.cashier-print .footer div { display: block !important; text-align: center !important; }
      body.cashier-print .footer div span { display: block !important; margin-bottom: 3px !important; color: #000 !important; }
      body.cashier-print .footer div span span { color: #000 !important; }
      
      body:not(.cashier-print) { background: white; padding: 0; }
      body:not(.cashier-print) .container { box-shadow: none; border: none; }
      body:not(.cashier-print) .invoice-card { margin: 15px 0; box-shadow:none; border:1px solid #ccc;}
      body:not(.cashier-print) .actions-container { display: none; }
    }
  </style>
</head>
<body>
  <div class="invoice-wrapper">
    <div class="container" id="invoice-container">
      <div class="header">
        <div class="logo">
          <img src="https://files.catbox.moe/god7c4.png" alt="النزلاوي" id="elnazlawy-logo">
        </div>
        <div class="company-info">
          <h1>معرض النزلاوي</h1>
          <div class="subtitle">لتجارة وتوزيع الأجهزة الكهربائية والإضاءة الحديثة</div>
        </div>
      </div>
      
      <div class="invoice-card">
        <div class="invoice-type-ribbon">فاتورة ${invoiceType}</div>
        <div class="invoice-info-grid">
          <table>
            <tr>
              <td><span class="info-label">رقم الفاتورة:</span> <span class="info-value">${orderNumber}</span></td>
              <td><span class="info-label">التاريخ:</span> <span class="info-value">${orderDate}</span></td>
            </tr>
            <tr>
              <td><span class="info-label">العميل:</span> <span class="info-value" id="customer">${customerName}</span></td>
              <td><span class="info-label">المندوب:</span> <span class="info-value">${employeeName}</span></td>
            </tr>
          </table>
        </div>
      </div>
      
      <div class="content">
        <div class="invoice-details" id="invoice-details">
          <table>
            <thead>
              <tr>
                <th>م</th>
                <th>اسم المنتج</th>
                <th>الكمية</th>
                <th>سعر الوحدة</th>
                <th>الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>
        </div>
        
        <div class="totals-container" id="totals-container">
          ${totalsHtml}
        </div>
      </div>
      
      <div class="footer">
        <p style="font-weight: bold; font-size: 1.1em; color: #2c3e50; margin-bottom: 8px;">شكراً لتعاملكم معنا في فرع النزلاوي</p>
        <p style="margin-bottom: 8px; color: #555;">📍 الفيوم - دلة - أمام مدرسة الزراعة بجوار كافيه الغابة</p>
        <div class="footer-phones" style="display: flex; justify-content: space-evenly; flex-wrap: wrap; gap: 15px; margin-top: 8px; font-weight: bold; color: #444;">
          <span>الحاج مهدي: <span style="color: #f56226;">01069991623</span></span>
          <span>أ/محمود حسين: <span style="color: #f56226;">01006172668</span></span>
          <span>أ/محمد حسين: <span style="color: #f56226;">01098700313</span></span>
        </div>
        ${taxInfoHtml}
      </div>
    </div>

    <!-- أزرار التحكم مأخوذة من RTX -->
    <div class="actions-container">
      <button class="print-button" onclick="printCashier()">
        🖨️ طباعة كاشير (8 سم)
      </button>
      <button class="print-normal-button" onclick="printNormal()">
        📄 طباعة عادية (A4)
      </button>
      <button id="download-pdf-btn" class="btn-download-pdf" onclick="downloadPDF()">
        تحميل PDF
      </button>
    </div>
  </div>

  <script>
    function printCashier() {
      document.body.classList.add('cashier-print');
      window.print();
      setTimeout(() => { document.body.classList.remove('cashier-print'); }, 500);
    }
    
    function printNormal() {
      document.body.classList.remove('cashier-print');
      window.print();
    }
    
    async function downloadPDF() {
      const downloadBtn = document.getElementById('download-pdf-btn');
      const originalBtnHTML = downloadBtn.innerHTML;
      downloadBtn.disabled = true;
      downloadBtn.innerHTML = 'جاري الإنشاء...';
      
      try {
        const invoiceElement = document.getElementById('invoice-container');
        const actionsContainer = document.querySelector('.actions-container');
        actionsContainer.style.display = 'none';
        
        const canvas = await html2canvas(invoiceElement, {
          useCORS: true, scale: 2, logging: false, backgroundColor: '#ffffff'
        });
        
        actionsContainer.style.display = 'flex';
        
        const imgData = canvas.toDataURL('image/jpeg', 0.9);
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const ratio = canvas.width / canvas.height;
        let imgWidth = pdfWidth - 10;
        let imgHeight = imgWidth / ratio;
        if (imgHeight > pdfHeight - 10) {
          imgHeight = pdfHeight - 10;
          imgWidth = imgHeight * ratio;
        }
        
        pdf.addImage(imgData, 'JPEG', 5, 5, imgWidth, imgHeight);
        pdf.save('فاتورة النزلاوي - ${orderNumber}.pdf');
        
      } catch (error) {
        alert("فشل إنشاء ملف PDF. يرجى المحاولة مرة أخرى.");
      } finally {
        downloadBtn.disabled = false;
        downloadBtn.innerHTML = originalBtnHTML;
      }
    }
  </script>
</body>
</html>
  `;
  return html;
}

// دالة بناء تقرير جرد المخزن الواحد
function buildStoreHtml(storeHeader, inventoryDetails) {
  var storeName = storeHeader["Store_Name S"] || "غير محدد";
  var storeType = storeHeader["Type S"] || "عام";
  var assignedRep = storeHeader["Assigned_Rep"] || "لا يوجد";
  
  var today = new Date();
  var dateStr = today.toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  // حساب الإجماليات
  var totalItems = 0;
  var totalValue = 0;
  var itemsHtml = "";

  for (var i = 0; i < inventoryDetails.length; i++) {
    var item = inventoryDetails[i];
    var stock = parseFloat(item["Current_Stock I"]) || 0;
    
    // جلب الحقول الافتراضية التي أضفناها في أبتشيت
    var price = parseFloat(item["Purchase_Price"]) || 0;
    var stockValue = parseFloat(item["Stock_Value"]) || 0;

    if (stock <= 0) {
      stockValue = 0;
    }

    totalItems += (stock > 0 ? stock : 0);
    totalValue += stockValue;

    itemsHtml += `
      <tr>
        <td>${i + 1}</td>
        <td style="text-align: right; padding-right: 15px;">${item["Product_Name I"] || ""}</td>
        <td>${item["Category I"] || ""}</td>
        <td style="font-weight: bold; color: #2b3e50;">${stock}</td>
        <td>${Number.isInteger(price) ? price : price.toFixed(2)}</td>
        <td style="font-weight: bold; color: #28a745;">${Number.isInteger(stockValue) ? stockValue : stockValue.toFixed(2)}</td>
      </tr>
    `;
  }

  var html = `
<!DOCTYPE html>
<html dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>تقرير جرد مخزن - ${storeName}</title>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body { font-family: 'Segoe UI', Tahoma, sans-serif; background: #f0f2f5; padding: 15px; direction: rtl; }
    .report-wrapper { max-width: 800px; margin: 1rem auto; }
    .container { background: white; box-shadow: 0 10px 40px rgba(0,0,0,0.1); border-radius: 12px; overflow: hidden; }
    
    .header { background: linear-gradient(135deg, #2b3e50, #1e2b38); color: white; padding: 25px; border-bottom: 4px solid #f56226; display: flex; align-items: center; justify-content: space-between; }
    .company-info h1 { font-size: 1.8em; margin-bottom: 5px; font-weight: 800; }
    .company-info .subtitle { color: rgba(255,255,255,0.85); font-size: 1em; }
    
    .report-card { background: #fff; margin: -15px 20px 15px 20px; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border: 1px solid #eee; overflow: hidden;}
    .report-title-ribbon { background: #2b3e50; color: white; text-align: center; font-weight: 800; font-size: 1.2em; padding: 10px; }
    .report-info-grid { padding: 15px; }
    .report-info-grid table { width: 100%; border-collapse: separate; border-spacing: 0 10px; }
    .report-info-grid td { width: 50%; vertical-align: middle; }
    .info-label { color: #888; font-size: 0.9em; display: inline-block; width: 100px; }
    .info-value { color: #2b3e50; font-weight: bold; font-size: 1em; }
    
    .content { padding: 0 20px 20px 20px; }
    .report-details table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 0.9em; background-color: #ffffff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .report-details th { background: #2b3e50; color: white; padding: 12px; font-weight: 600; text-align: center; border: 1px solid #e5e7eb; }
    .report-details td { padding: 10px; text-align: center; border: 1px solid #e5e7eb; background-color: transparent; }
    .report-details tr:nth-child(even) { background-color: #f9fafb; }
    .report-details tr:nth-child(odd) { background-color: #ffffff; }
    
    .summary-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px; }
    .card { background: #f8f9fa; border: 1px solid #ddd; border-radius: 8px; padding: 15px; text-align: center; }
    .card .label { font-size: 0.95em; color: #666; font-weight: 600; margin-bottom: 5px; }
    .card .value { font-size: 1.6em; font-weight: bold; color: #f56226; }
    .card.total-val { border-left: 5px solid #28a745; }
    .card.total-qty { border-left: 5px solid #f56226; }
    .card.total-val .value { color: #28a745; }
    
    .actions-container { padding: 1.5rem; text-align: center; display: flex; gap: 1rem; justify-content: center; }
    .print-button { background: linear-gradient(135deg, #2b3e50, #1e2b38); color: white; border: none; padding: 0.7rem 2rem; font-size: 1.1rem; font-weight: 700; cursor: pointer; border-radius: 40px; box-shadow: 0 4px 10px rgba(43, 62, 80, 0.3); }
    .btn-download-pdf { background: linear-gradient(135deg, #28a745, #20c997); color: white; border: none; padding: 0.7rem 2rem; font-size: 1.1rem; font-weight: 700; cursor: pointer; border-radius: 40px; }
    
    .footer { background: #f8f9fa; padding: 15px; text-align: center; color: #666; border-top: 1px solid #ddd; font-size: 0.85em; }
    
    @media print {
      html, body { background: #ffffff !important; background-color: #ffffff !important; padding: 0 !important; margin: 0 !important; }
      .report-wrapper { background: #ffffff !important; }
      .container { background: #ffffff !important; background-color: #ffffff !important; box-shadow: none !important; border: none !important; }
      .report-card { background: #ffffff !important; background-color: #ffffff !important; margin: 0 !important; box-shadow: none !important; border: 1px solid #ccc !important; }
      .report-info-grid { background: #ffffff !important; }
      .summary-cards { background: #ffffff !important; }
      .card { background: #f8f9fa !important; }
      .content { background: #ffffff !important; }
      .footer { background: #f8f9fa !important; }
      .actions-container { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="report-wrapper">
    <div class="container" id="report-container">
      <div class="header">
        <div class="company-info">
          <h1>معرض النزلاوي</h1>
          <div class="subtitle">تقرير جرد المخزون التفصيلي</div>
        </div>
      </div>
      
      <div class="report-card">
        <div class="report-title-ribbon">تقرير جرد مخزن: ${storeName}</div>
        <div class="report-info-grid">
          <table>
            <tr>
              <td><span class="info-label">اسم المخزن:</span> <span class="info-value">${storeName}</span></td>
              <td><span class="info-label">تاريخ الجرد:</span> <span class="info-value">${dateStr}</span></td>
            </tr>
            <tr>
              <td><span class="info-label">نوع المخزن:</span> <span class="info-value">${storeType}</span></td>
              <td><span class="info-label">المسؤول:</span> <span class="info-value">${assignedRep}</span></td>
            </tr>
          </table>
        </div>
      </div>
      
      <div class="content">
        <div class="summary-cards">
          <div class="card total-qty">
            <div class="label">إجمالي كمية القطع</div>
            <div class="value">${totalItems}</div>
          </div>
          <div class="card total-val">
            <div class="label">إجمالي قيمة المخزون (سعر الشراء)</div>
            <div class="value">${Number.isInteger(totalValue) ? totalValue : totalValue.toFixed(2)}</div>
          </div>
        </div>

        <div class="report-details">
          <table>
            <thead>
              <tr>
                <th>م</th>
                <th>اسم الصنف</th>
                <th>القسم / الفئة</th>
                <th>الرصيد الحالي (قطع)</th>
                <th>سعر الشراء للقطعة</th>
                <th>إجمالي القيمة</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>
        </div>
      </div>
      
      <div class="footer">
        <p>معرض النزلاوي للأجهزة الكهربائية والإضاءة الحديثة</p>
      </div>
    </div>

    <div class="actions-container">
      <button class="print-button" onclick="window.print()">
        🖨️ طباعة التقرير (A4)
      </button>
      <button id="download-pdf-btn" class="btn-download-pdf" onclick="downloadPDF()">
        تحميل PDF
      </button>
    </div>
  </div>

  <script>
    async function downloadPDF() {
      const downloadBtn = document.getElementById('download-pdf-btn');
      const originalBtnHTML = downloadBtn.innerHTML;
      downloadBtn.disabled = true;
      downloadBtn.innerHTML = 'جاري الإنشاء...';
      
      try {
        const reportElement = document.getElementById('report-container');
        const actionsContainer = document.querySelector('.actions-container');
        actionsContainer.style.display = 'none';
        
        const canvas = await html2canvas(reportElement, {
          useCORS: true, 
          scale: 1, 
          logging: false, 
          backgroundColor: '#ffffff',
          imageTimeout: 1000
        });
        
        actionsContainer.style.display = 'flex';
        
        const imgData = canvas.toDataURL('image/jpeg', 0.9);
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        
        const pageHeight = pdfHeight;
        const imgWidth = pdfWidth;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        let heightLeft = imgHeight;
        let position = 0;
        
        pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
        
        while (heightLeft > 0) {
          position = heightLeft - imgHeight;
          pdf.addPage();
          pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
          heightLeft -= pageHeight;
        }
        
        pdf.save('جرد مخزن ${storeName} - ' + new Date().toLocaleDateString('en-US') + '.pdf');
        
      } catch (error) {
        alert("فشل إنشاء ملف PDF بسبب حجم التقرير. يرجى استخدام زر (طباعة التقرير) وحفظه بتنسيق PDF فهو أدق وأسرع.");
      } finally {
        downloadBtn.disabled = false;
        downloadBtn.innerHTML = originalBtnHTML;
      }
    }
  </script>
</body>
</html>
  `;
  return html;
}

// دالة بناء تقرير جرد جميع المخازن معاً
function buildAllStoresHtml(allStores, allInventory) {
  var today = new Date();
  var dateStr = today.toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  var grandTotalItems = 0;
  var grandTotalValue = 0;
  var storesHtml = "";

  // ترتيب المخازن هجائياً
  allStores.sort(function(a, b) {
    return (a["Store_Name S"] || "").localeCompare(b["Store_Name S"] || "", 'ar');
  });

  for (var s = 0; s < allStores.length; s++) {
    var store = allStores[s];
    var id = store["Store_Id S"];
    var name = store["Store_Name S"] || "غير محدد";
    var rep = store["Assigned_Rep"] || "لا يوجد";

    // فلترة الأصناف التي تنتمي لهذا المخزن
    var storeInventory = allInventory.filter(function(item) {
      return item["Store_Id I"] === id;
    });

    if (storeInventory.length === 0) continue; // تجاوز المخازن الفارغة

    var storeItemsHtml = "";
    var storeQty = 0;
    var storeVal = 0;

    for (var i = 0; i < storeInventory.length; i++) {
      var item = storeInventory[i];
      var stock = parseFloat(item["Current_Stock I"]) || 0;
      var price = parseFloat(item["Purchase_Price"]) || 0;
      var stockValue = parseFloat(item["Stock_Value"]) || 0;

      if (stock <= 0) {
        stockValue = 0;
      }

      storeQty += (stock > 0 ? stock : 0);
      storeVal += stockValue;

      storeItemsHtml += `
        <tr>
          <td>${i + 1}</td>
          <td style="text-align: right; padding-right: 15px;">${item["Product_Name I"] || ""}</td>
          <td>${item["Category I"] || ""}</td>
          <td style="font-weight: bold;">${stock}</td>
          <td>${Number.isInteger(price) ? price : price.toFixed(2)}</td>
          <td style="font-weight: bold; color: #28a745;">${Number.isInteger(stockValue) ? stockValue : stockValue.toFixed(2)}</td>
        </tr>
      `;
    }

    grandTotalItems += storeQty;
    grandTotalValue += storeVal;

    storesHtml += `
      <div class="store-section" style="margin-bottom: 40px; page-break-inside: avoid;">
        <div class="store-header" style="background: #34495e; color: white; padding: 12px 20px; border-radius: 8px 8px 0 0; display: flex; justify-content: space-between; align-items: center; font-weight: bold;">
          <span>🏬 مخزن: ${name}</span>
          <span style="font-size: 0.9em; font-weight: normal;">المسؤول: ${rep}</span>
        </div>
        <div class="report-details" style="margin-bottom: 0; padding:0;">
          <table style="width: 100%; border-collapse: collapse; font-size: 0.85em; box-shadow: none;">
            <thead>
              <tr style="background: #677077; color: white;">
                <th style="padding: 10px; border: 1px solid #ddd; width: 40px; background:#34495e;">م</th>
                <th style="padding: 10px; border: 1px solid #ddd; background:#34495e; text-align:right;">اسم الصنف</th>
                <th style="padding: 10px; border: 1px solid #ddd; width: 150px; background:#34495e;">القسم / الفئة</th>
                <th style="padding: 10px; border: 1px solid #ddd; width: 100px; background:#34495e;">الرصيد الحالي</th>
                <th style="padding: 10px; border: 1px solid #ddd; width: 120px; background:#34495e;">سعر الشراء للقطعة</th>
                <th style="padding: 10px; border: 1px solid #ddd; width: 120px; background:#34495e;">إجمالي القيمة</th>
              </tr>
            </thead>
            <tbody>
              ${storeItemsHtml}
              <tr style="background: #ecf0f1; font-weight: bold; border-top: 2px solid #34495e; color:#2c3e50;">
                <td colspan="3" style="text-align: left; padding: 10px; border: 1px solid #ddd;">إجمالي ${name}:</td>
                <td style="padding: 10px; border: 1px solid #ddd; color: #f56226;">${storeQty}</td>
                <td style="padding: 10px; border: 1px solid #ddd;">-</td>
                <td style="padding: 10px; border: 1px solid #ddd; color: #28a745;">${Number.isInteger(storeVal) ? storeVal : storeVal.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  var html = `
<!DOCTYPE html>
<html dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>تقرير جرد جميع المخازن</title>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body { font-family: 'Segoe UI', Tahoma, sans-serif; background: #f0f2f5; padding: 15px; direction: rtl; }
    .report-wrapper { max-width: 850px; margin: 1rem auto; }
    .container { background: white; box-shadow: 0 10px 40px rgba(0,0,0,0.1); border-radius: 12px; overflow: hidden; }
    
    .header { background: linear-gradient(135deg, #1a252f, #2c3e50); color: white; padding: 25px; border-bottom: 4px solid #f56226; display: flex; align-items: center; justify-content: space-between; }
    .company-info h1 { font-size: 1.8em; margin-bottom: 5px; font-weight: 800; }
    .company-info .subtitle { color: rgba(255,255,255,0.85); font-size: 1em; }
    
    .report-card { background: #fff; margin: -15px 20px 15px 20px; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border: 1px solid #eee; overflow: hidden;}
    .report-title-ribbon { background: #1a252f; color: white; text-align: center; font-weight: 800; font-size: 1.2em; padding: 10px; }
    .report-info-grid { padding: 15px; }
    .report-info-grid table { width: 100%; border-collapse: separate; border-spacing: 0 10px; }
    .report-info-grid td { width: 50%; vertical-align: middle; }
    .info-label { color: #888; font-size: 0.9em; display: inline-block; width: 120px; }
    .info-value { color: #1a252f; font-weight: bold; font-size: 1em; }
    
    .content { padding: 0 20px 20px 20px; }
    
    .report-details table { width: 100%; border-collapse: collapse; background-color: #ffffff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .report-details table th { background: #34495e; color: white; padding: 10px; font-weight: 600; text-align: center; border: 1px solid #e5e7eb; }
    .report-details table td { padding: 8px; text-align: center; border: 1px solid #e5e7eb; background-color: transparent; }
    .report-details table tr:nth-child(even) { background-color: #f9fafb; }
    .report-details table tr:nth-child(odd) { background-color: #ffffff; }
    
    .summary-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 30px; }
    .card { background: #f8f9fa; border: 1px solid #ddd; border-radius: 8px; padding: 15px; text-align: center; }
    .card .label { font-size: 0.95em; color: #666; font-weight: 600; margin-bottom: 5px; }
    .card .value { font-size: 1.6em; font-weight: bold; color: #f56226; }
    .card.total-val { border-left: 5px solid #28a745; }
    .card.total-qty { border-left: 5px solid #f56226; }
    .card.total-val .value { color: #28a745; }
    
    .actions-container { padding: 1.5rem; text-align: center; display: flex; gap: 1rem; justify-content: center; }
    .print-button { background: linear-gradient(135deg, #1a252f, #2c3e50); color: white; border: none; padding: 0.7rem 2rem; font-size: 1.1rem; font-weight: 700; cursor: pointer; border-radius: 40px; box-shadow: 0 4px 10px rgba(26, 37, 47, 0.3); }
    .btn-download-pdf { background: linear-gradient(135deg, #28a745, #20c997); color: white; border: none; padding: 0.7rem 2rem; font-size: 1.1rem; font-weight: 700; cursor: pointer; border-radius: 40px; }
    
    .footer { background: #f8f9fa; padding: 15px; text-align: center; color: #666; border-top: 1px solid #ddd; font-size: 0.85em; }
    
    @media print {
      html, body { background: #ffffff !important; background-color: #ffffff !important; padding: 0 !important; margin: 0 !important; }
      .report-wrapper { background: #ffffff !important; }
      .container { background: #ffffff !important; background-color: #ffffff !important; box-shadow: none !important; border: none !important; }
      .report-card { background: #ffffff !important; background-color: #ffffff !important; margin: 0 !important; box-shadow: none !important; border: 1px solid #ccc !important; }
      .report-info-grid { background: #ffffff !important; }
      .summary-cards { background: #ffffff !important; }
      .card { background: #f8f9fa !important; }
      .content { background: #ffffff !important; }
      .store-section { background: #ffffff !important; }
      .footer { background: #f8f9fa !important; }
      .actions-container { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="report-wrapper">
    <div class="container" id="report-container">
      <div class="header">
        <div class="company-info">
          <h1>معرض النزلاوي</h1>
          <div class="subtitle">تقرير جرد المخازن الشامل</div>
        </div>
      </div>
      
      <div class="report-card">
        <div class="report-title-ribbon">تقرير جرد جميع مخازن الشركة</div>
        <div class="report-info-grid">
          <table>
            <tr>
              <td><span class="info-label">نوع التقرير:</span> <span class="info-value">جرد شامل لكافة الفروع والمستودعات</span></td>
              <td><span class="info-label">تاريخ الجرد:</span> <span class="info-value">${dateStr}</span></td>
            </tr>
          </table>
        </div>
      </div>
      
      <div class="content">
        <div class="summary-cards">
          <div class="card total-qty">
            <div class="label">إجمالي كمية القطع بالشركة</div>
            <div class="value">${grandTotalItems}</div>
          </div>
          <div class="card total-val">
            <div class="label">إجمالي قيمة بضاعة الشركة (سعر الشراء)</div>
            <div class="value">${Number.isInteger(grandTotalValue) ? grandTotalValue : grandTotalValue.toFixed(2)} جنيه</div>
          </div>
        </div>

        ${storesHtml}
      </div>
      
      <div class="footer">
        <p>معرض النزلاوي للأجهزة الكهربائية والإضاءة الحديثة</p>
      </div>
    </div>

    <div class="actions-container">
      <button class="print-button" onclick="window.print()">
        🖨️ طباعة التقرير الشامل (A4)
      </button>
      <button id="download-pdf-btn" class="btn-download-pdf" onclick="downloadPDF()">
        تحميل PDF الشامل
      </button>
    </div>
  </div>

  <script>
    async function downloadPDF() {
      const downloadBtn = document.getElementById('download-pdf-btn');
      const originalBtnHTML = downloadBtn.innerHTML;
      downloadBtn.disabled = true;
      downloadBtn.innerHTML = 'جاري الإنشاء...';
      
      try {
        const reportElement = document.getElementById('report-container');
        const actionsContainer = document.querySelector('.actions-container');
        actionsContainer.style.display = 'none';
        
        // استخدام scale: 1 لتقليل وقت التجهيز وحل مشكلة البطء في التقارير الطويلة
        const canvas = await html2canvas(reportElement, {
          useCORS: true, 
          scale: 1, 
          logging: false, 
          backgroundColor: '#ffffff',
          imageTimeout: 1000
        });
        
        actionsContainer.style.display = 'flex';
        
        const imgData = canvas.toDataURL('image/jpeg', 0.9);
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        
        const pageHeight = pdfHeight;
        const imgWidth = pdfWidth;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        let heightLeft = imgHeight;
        let position = 0;
        
        pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
        
        while (heightLeft > 0) {
          position = heightLeft - imgHeight;
          pdf.addPage();
          pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
          heightLeft -= pageHeight;
        }
        
        pdf.save('جرد شامل لجميع المخازن - ' + new Date().toLocaleDateString('en-US') + '.pdf');
        
      } catch (error) {
        alert("فشل إنشاء ملف PDF بسبب حجم التقرير الشامل الكبير جداً. يرجى استخدام زر (طباعة التقرير الشامل) واختيار حفظ بتنسيق PDF فهو آمن ويدعم التقارير الطويلة بدون أي مشاكل.");
      } finally {
        downloadBtn.disabled = false;
        downloadBtn.innerHTML = originalBtnHTML;
      }
    }
  </script>
</body>
</html>
  `;
  return html;
}

// =========================================
// 1. كشف حساب العميل
// =========================================
function generateCustomerStatement(customerId) {
  try {
    // 1. جلب بيانات العميل
    var customerData = fetchAppSheetData("Customer", "Filter(\"Customer\", [Customer_Id C] = '" + customerId + "')");
    if (!customerData || customerData.length === 0) {
      return HtmlService.createHtmlOutput("<h3 style='direction: rtl; text-align:center;'>العميل غير موجود.</h3>");
    }
    var customer = customerData[0];
    var openingBalance = parseFloat(customer["Opening_Balance C"]) || 0;
    
    // 2. جلب مبيعات العميل (الفواتير)
    var ordersData = fetchAppSheetData("Orders", "Filter(\"Orders\", AND([Customer_Id O] = '" + customerId + "', [Invoice_Type O] <> 'عرض سعر'))");
    
    // 3. جلب مدفوعات العميل
    var paymentsData = fetchAppSheetData("CustomerPayment", "Filter(\"CustomerPayment\", [Customer_Id CP] = '" + customerId + "')");

    // 4. دمج الحركات في مصفوفة واحدة
    var transactions = [];
    
    // إضافة فواتير البيع (تزيد المديونية)
    if(ordersData) {
        for (var i = 0; i < ordersData.length; i++) {
          transactions.push({
            date: new Date(ordersData[i]["Order_Date O"]),
            dateStr: ordersData[i]["Order_Date O"],
            type: "فاتورة مبيعات",
            docNumber: ordersData[i]["Order Number O"],
            debit: parseFloat(ordersData[i]["After Discount O"]) || 0, // مدين (عليه)
            credit: 0,
            notes: "فاتورة مبيعات " + (ordersData[i]["Invoice_Type O"] || "")
          });
        }
    }

    // إضافة المدفوعات (تقلل المديونية)
    if(paymentsData) {
        for (var j = 0; j < paymentsData.length; j++) {
          transactions.push({
            date: new Date(paymentsData[j]["Date CP"]),
            dateStr: paymentsData[j]["Date CP"],
            type: "سداد نقدي / دفعة",
            docNumber: paymentsData[j]["Payment_Id CP"].substring(0, 5),
            debit: 0,
            credit: parseFloat(paymentsData[j]["Amount CP"]) || 0, // دائن (له)
            notes: paymentsData[j]["Notes CP"] || "سداد نقدي"
          });
        }
    }

    // 5. الترتيب الزمني للتاريخ
    transactions.sort(function(a, b) {
      return a.date - b.date;
    });

    // 6. توليد HTML
    var html = buildStatementHtml("كشف حساب عميل", customer["Customer_Name C"], openingBalance, transactions);
    return HtmlService.createHtmlOutput(html).setTitle("كشف حساب - " + customer["Customer_Name C"]);

  } catch (error) {
    return HtmlService.createHtmlOutput("<h3 style='direction: rtl; text-align:center;'>حدث خطأ: " + error.message + "</h3>");
  }
}

// =========================================
// 2. كشف حساب المورد
// =========================================
function generateSupplierStatement(supplierId) {
  try {
    // 1. جلب بيانات المورد
    var supplierData = fetchAppSheetData("Supplier", "Filter(\"Supplier\", [Supplier_Id SU] = '" + supplierId + "')");
    if (!supplierData || supplierData.length === 0) {
      return HtmlService.createHtmlOutput("<h3 style='direction: rtl; text-align:center;'>المورد غير موجود.</h3>");
    }
    var supplier = supplierData[0];
    var openingBalance = parseFloat(supplier["Opening_Balance S"]) || 0;
    
    // 2. جلب مشتريات المورد
    var purchasesData = fetchAppSheetData("PurchaseInvoice", "Filter(\"PurchaseInvoice\", [Supplier_Id PI] = '" + supplierId + "')");
    
    // 3. جلب مدفوعات المورد
    var paymentsData = fetchAppSheetData("SupplierPayment", "Filter(\"SupplierPayment\", [Supplier_Id SP] = '" + supplierId + "')");

    // 4. دمج الحركات في مصفوفة واحدة
    var transactions = [];
    
    // إضافة فواتير المشتريات (تزيد مديونيتنا للمورد)
    if(purchasesData) {
        for (var i = 0; i < purchasesData.length; i++) {
          transactions.push({
            date: new Date(purchasesData[i]["Purchase_Date PI"]),
            dateStr: purchasesData[i]["Purchase_Date PI"],
            type: "فاتورة مشتريات",
            docNumber: purchasesData[i]["Purchase_Number PI"],
            debit: 0,
            credit: parseFloat(purchasesData[i]["Total_Amount PI"]) || 0, // دائن (لصالح المورد)
            notes: "فاتورة شراء بضاعة"
          });
        }
    }

    // إضافة المدفوعات للمورد (تقلل مديونيتنا)
    if(paymentsData) {
        for (var j = 0; j < paymentsData.length; j++) {
          transactions.push({
            date: new Date(paymentsData[j]["Payment_Date SP"]),
            dateStr: paymentsData[j]["Payment_Date SP"],
            type: "سداد للمورد",
            docNumber: paymentsData[j]["Payment_Id SP"].substring(0, 5),
            debit: parseFloat(paymentsData[j]["Amount SP"]) || 0, // مدين (خصم من حسابه)
            credit: 0,
            notes: paymentsData[j]["Notes SP"] || "سداد نقدي"
          });
        }
    }

    // 5. الترتيب الزمني للتاريخ
    transactions.sort(function(a, b) {
      return a.date - b.date;
    });

    // 6. توليد HTML
    var html = buildStatementHtml("كشف حساب مورد", supplier["Supplier_Name SU"], openingBalance, transactions);
    return HtmlService.createHtmlOutput(html).setTitle("كشف حساب - " + supplier["Supplier_Name SU"]);

  } catch (error) {
    return HtmlService.createHtmlOutput("<h3 style='direction: rtl; text-align:center;'>حدث خطأ: " + error.message + "</h3>");
  }
}

// =========================================
// بناء واجهة HTML لكشف الحساب
// =========================================
function buildStatementHtml(title, name, openingBalance, transactions) {
  // دالة لتنسيق الأرقام (حذف الأصفار العشرية غير الضرورية)
  function formatNumber(num) {
    if (num === 0 || !num) return "-";
    return parseFloat(Number(num).toFixed(2));
  }
  
  // دالة لتنسيق الأرصدة (لأن الرصيد قد يكون 0 ونريد طباعته)
  function formatBalance(num) {
    return parseFloat(Number(num).toFixed(2));
  }

  var runningBalance = openingBalance;
  var rowsHtml = "";
  
  // سطر الرصيد الافتتاحي بشكل محسن
  rowsHtml += `
    <tr style="background-color: #e2e8f0; font-weight: bold; border-bottom: 2px solid #cbd5e1;">
      <td>--</td>
      <td>رصيد أول المدة</td>
      <td>--</td>
      <td style="color: #d32f2f;">${openingBalance < 0 ? formatNumber(Math.abs(openingBalance)) : "-"}</td>
      <td style="color: #388e3c;">${openingBalance > 0 ? formatNumber(openingBalance) : "-"}</td>
      <td style="color: #1e88e5; font-size: 1.1em;">${formatBalance(openingBalance)}</td>
      <td>أرصدة افتتاحية</td>
    </tr>
  `;

  var totalDebit = 0;
  var totalCredit = 0;

  for (var i = 0; i < transactions.length; i++) {
    var tr = transactions[i];
    
    if (title.indexOf("عميل") !== -1) {
      runningBalance = runningBalance + tr.debit - tr.credit;
    } else {
      runningBalance = runningBalance + tr.credit - tr.debit;
    }

    totalDebit += tr.debit;
    totalCredit += tr.credit;

    rowsHtml += `
      <tr>
        <td>${tr.dateStr || "غير محدد"}</td>
        <td>${tr.type}</td>
        <td>${tr.docNumber || "-"}</td>
        <td style="color: #d32f2f; font-weight: bold;">${formatNumber(tr.debit)}</td>
        <td style="color: #388e3c; font-weight: bold;">${formatNumber(tr.credit)}</td>
        <td style="font-weight: bold; color: #1e88e5; background: #f8fafc;">${formatBalance(runningBalance)}</td>
        <td>${tr.notes || ""}</td>
      </tr>
    `;
  }

  var printDate = new Date().toLocaleString('ar-EG', { hour12: true });

  return `
<!DOCTYPE html>
<html dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>${title} - ${name}</title>
  <style>
    body { font-family: 'Segoe UI', Tahoma, sans-serif; background: #f0f2f5; padding: 20px; direction: rtl; }
    .container { max-width: 950px; margin: 0 auto; background: white; padding: 25px; border-radius: 8px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
    .header { text-align: center; border-bottom: 3px solid #f56226; padding-bottom: 15px; margin-bottom: 20px; }
    .header h1 { color: #333; margin-bottom: 5px; font-size: 2.2em; }
    .header h2 { color: #677077; font-size: 1.4em; margin-bottom: 15px; }
    .header h3 { color: #f56226; background: #fff3cd; display: inline-block; padding: 5px 15px; border-radius: 20px; }
    .header .date-text { margin-top: 15px; color: #555; font-size: 1em; font-weight: bold; }
    
    table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 0.95em; text-align: center; }
    th { background: #677077; color: white; padding: 12px; border: 1px solid #ddd; }
    td { padding: 10px; border: 1px solid #ddd; }
    tr:nth-child(even) { background-color: #f9f9f9; }
    tr:hover { background-color: #f1f5f9; }
    
    .summary { margin-top: 25px; display: flex; justify-content: space-around; background: #eef2f6; padding: 15px; border-radius: 8px; border: 1px solid #cdd5df; }
    .summary-box { text-align: center; font-size: 1.1em; font-weight: bold; color: #555; width: 30%; }
    .summary-box span { display: block; font-size: 1.6em; margin-top: 5px; }
    
    .print-btn { display: block; width: 220px; margin: 30px auto; padding: 12px; text-align: center; background: #f56226; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 1.1em; font-weight: bold; transition: background 0.3s; }
    .print-btn:hover { background: #d84e1b; }
    @media print { .print-btn { display: none; } body { background: white; padding: 0; } .container { box-shadow: none; max-width: 100%; border: none; padding: 0; } }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>النزلاوي للأجهزة الكهربائية</h1>
      <h2>${title} تفصيلي</h2>
      <h3>الاسم: ${name}</h3>
      <div class="date-text">تاريخ طباعة الكشف: ${printDate}</div>
    </div>
    
    <table>
      <thead>
        <tr>
          <th>التاريخ</th>
          <th>البيان</th>
          <th>رقم المستند</th>
          <th>مدين (عليه)</th>
          <th>دائن (له)</th>
          <th>الرصيد التراكمي</th>
          <th>ملاحظات</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>

    <div class="summary">
      <div class="summary-box">إجمالي مدين<span style="color:#d32f2f;">${formatBalance(totalDebit)}</span></div>
      <div class="summary-box">إجمالي دائن<span style="color:#388e3c;">${formatBalance(totalCredit)}</span></div>
      <div class="summary-box" style="color: #1e88e5;">الرصيد النهائي الحالي<span>${formatBalance(runningBalance)}</span></div>
    </div>
    
    <button class="print-btn" onclick="window.print()">🖨️ طباعة أو حفظ PDF</button>
  </div>
</body>
</html>
  `;
}
