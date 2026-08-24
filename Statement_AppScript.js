// ====== الإعدادات الأساسية (النزلاوي) ======
var APP_ID = "b8033f0f-4f66-4166-a39a-efda39f7faab";
var ACCESS_KEY = "V2-SQAdE-NCoT1-6BUNV-UqOfw-HK3pa-OhlnS-owrO9-Q36CZ";

// الدالة الرئيسية
function doGet(e) {
  var customerId = e.parameter.customerId;
  var supplierId = e.parameter.supplierId;

  if (customerId) {
    return generateCustomerStatement(customerId);
  } else if (supplierId) {
    return generateSupplierStatement(supplierId);
  } else {
    return HtmlService.createHtmlOutput("<h3 style='direction: rtl; font-family: Tahoma; text-align:center; padding: 50px;'>خطأ: لم يتم إرسال كود العميل أو المورد.</h3>");
  }
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
// بناء واجهة HTML لكشف الحساب (تصميم النزلاوي)
// =========================================
function buildStatementHtml(title, name, openingBalance, transactions) {
  var runningBalance = openingBalance;
  var rowsHtml = "";
  
  // سطر الرصيد الافتتاحي
  rowsHtml += `
    <tr style="background-color: #f1f5f9; font-weight: bold;">
      <td>-</td>
      <td>رصيد أول المدة</td>
      <td>-</td>
      <td>-</td>
      <td>-</td>
      <td style="color: #1e88e5;">${openingBalance.toFixed(2)}</td>
      <td>رصيد البداية</td>
    </tr>
  `;

  var totalDebit = 0;
  var totalCredit = 0;

  for (var i = 0; i < transactions.length; i++) {
    var tr = transactions[i];
    
    // تحديث الرصيد التراكمي
    // للعميل: الرصيد = مدين (شراء) - دائن (دفع)
    // للمورد: الرصيد = دائن (وردلنا) - مدين (أخد فلوس)
    // هنا هنوحد المعادلة بحيث (المدين) يزود و(الدائن) ينقص، والنتيجة النهائية حسب نوع الكشف
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
        <td style="color: #d32f2f; font-weight: bold;">${tr.debit > 0 ? tr.debit.toFixed(2) : "-"}</td>
        <td style="color: #388e3c; font-weight: bold;">${tr.credit > 0 ? tr.credit.toFixed(2) : "-"}</td>
        <td style="font-weight: bold; color: #1e88e5; background: #f8fafc;">${runningBalance.toFixed(2)}</td>
        <td>${tr.notes || ""}</td>
      </tr>
    `;
  }

  return `
<!DOCTYPE html>
<html dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>${title} - ${name}</title>
  <style>
    body { font-family: 'Segoe UI', Tahoma, sans-serif; background: #f0f2f5; padding: 20px; direction: rtl; }
    .container { max-width: 900px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
    .header { text-align: center; border-bottom: 3px solid #f56226; padding-bottom: 15px; margin-bottom: 20px; }
    .header h1 { color: #333; margin-bottom: 5px; font-size: 2em; }
    .header h2 { color: #677077; font-size: 1.4em; }
    .header h3 { color: #f56226; background: #fff3cd; display: inline-block; padding: 5px 15px; border-radius: 20px; }
    
    table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 0.9em; text-align: center; }
    th { background: #677077; color: white; padding: 12px; border: 1px solid #ddd; }
    td { padding: 10px; border: 1px solid #ddd; }
    tr:nth-child(even) { background-color: #f9f9f9; }
    
    .summary { margin-top: 20px; display: flex; justify-content: space-around; background: #eef2f6; padding: 15px; border-radius: 8px; border: 1px solid #cdd5df; }
    .summary-box { text-align: center; font-size: 1.1em; font-weight: bold; color: #555; }
    .summary-box span { display: block; font-size: 1.5em; margin-top: 5px; }
    
    .print-btn { display: block; width: 220px; margin: 20px auto; padding: 12px; text-align: center; background: #f56226; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 1.1em; font-weight: bold; transition: background 0.3s; }
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
      <div class="summary-box">إجمالي مدين<span style="color:#d32f2f;">${totalDebit.toFixed(2)}</span></div>
      <div class="summary-box">إجمالي دائن<span style="color:#388e3c;">${totalCredit.toFixed(2)}</span></div>
      <div class="summary-box" style="color: #1e88e5;">الرصيد النهائي الحالي<span>${runningBalance.toFixed(2)}</span></div>
    </div>
    
    <button class="print-btn" onclick="window.print()">🖨️ طباعة أو حفظ PDF</button>
  </div>
</body>
</html>
  `;
}

// =========================================
// دالة الاتصال بـ AppSheet (نفس الدالة المستخدمة مسبقاً)
// =========================================
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

  if (response.getResponseCode() === 429) {
    if (attempt <= 3) {
      Utilities.sleep(1000 * attempt);
      return fetchAppSheetData(tableName, selector, attempt + 1);
    } else {
      throw new Error("السيرفر مشغول حالياً. يرجى المحاولة بعد قليل.");
    }
  }

  if (response.getResponseCode() !== 200) {
    throw new Error("API Error (" + response.getResponseCode() + "): " + responseText);
  }

  try {
    return JSON.parse(responseText);
  } catch (parseError) {
    throw new Error("خطأ في قراءة استجابة AppSheet.");
  }
}
