// ============================================================
// قاعدة البيانات
// ============================================================

let data = JSON.parse(localStorage.getItem("accountingData_v2")) || {
    customers: [],
    suppliers: [],
    products: [],
    sales: [],
    purchases: [],
    expenses: [],
    payments: []
};

(function migrateOldData() {
    const old = localStorage.getItem("accountingData");
    if (!old) return;
    const hasNew = localStorage.getItem("accountingData_v2");
    if (hasNew) return;
    try {
        const oldData = JSON.parse(old);
        data = { ...data, ...oldData };
        data.products = (data.products || []).map(p => ({ ...p, multi: false }));
        saveData();
    } catch (e) {
        console.warn("فشل ترحيل البيانات القديمة", e);
    }
})();

function saveData() {
    localStorage.setItem("accountingData_v2", JSON.stringify(data));
}


// ============================================================
// أدوات مساعدة
// ============================================================

function money(n) {
    return Number(n || 0).toLocaleString("ar-IQ", { maximumFractionDigits: 2 });
}

function today() {
    return new Date().toLocaleDateString("en-CA");
}

function escapeHTML(text) {
    return String(text ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function uid() {
    return Date.now() + Math.floor(Math.random() * 1000);
}

document.getElementById("headerDate").textContent =
    new Date().toLocaleDateString("ar-IQ", {
        weekday: "long", year: "numeric", month: "long", day: "numeric"
    });


// ============================================================
// التنقل بين الصفحات
// ============================================================

function showPage(pageId, button) {
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active-page"));
    document.getElementById(pageId).classList.add("active-page");

    document.querySelectorAll(".menu button").forEach(b => b.classList.remove("active"));
    if (button) button.classList.add("active");

    renderAll();
}


// ============================================================
// نظام المخزون (كراتين + طبقات)
// ============================================================

function productStockParts(p) {
    if (!p.multi) return null;
    const perMain = Number(p.perMain) || 12;
    const total = Number(p.stockSmall) || 0;
    const mains = Math.floor(total / perMain);
    const small = total % perMain;
    return { mains, small, perMain, total };
}

function formatStock(p) {
    if (!p.multi) {
        return `<span class="stock-badge">${money(p.quantity || 0)} وحدة</span>`;
    }
    const { mains, small, perMain } = productStockParts(p);
    const mainName = p.unitMain || "كارتونة";
    const smallName = p.unitSmall || "طبقة";

    if (mains === 0 && small === 0) {
        return `<span class="stock-badge danger">نافذ</span>`;
    }

    let html = "";
    if (mains > 0) {
        html += `<span class="stock-badge">${mains} ${escapeHTML(mainName)} كاملة</span> `;
    }
    if (small > 0) {
        html += `<span class="stock-badge open">فرط: ${small} ${escapeHTML(smallName)} (من ${perMain})</span>`;
    }
    return html;
}

function deductSmall(p, qtySmall) {
    const total = Number(p.stockSmall) || 0;
    if (qtySmall > total) {
        return { ok: false, message: `الكمية غير كافية. المتوفر ${total} طبقة فقط` };
    }
    p.stockSmall = total - qtySmall;
    return { ok: true };
}

function deductMain(p, qtyMain) {
    const perMain = Number(p.perMain) || 12;
    const { mains, small, total } = productStockParts(p);
    if (qtyMain <= 0) return { ok: false, message: "كمية غير صحيحة" };

    if (qtyMain > mains) {
        return {
            ok: false,
            message: `ماكو كراتين كاملة كافية. عندك ${mains} كارتونة + فرط (${small} طبقة)`
        };
    }
    p.stockSmall = total - (qtyMain * perMain);
    return { ok: true };
}

function addMain(p, qtyMain) {
    const perMain = Number(p.perMain) || 12;
    p.stockSmall = (Number(p.stockSmall) || 0) + (qtyMain * perMain);
}


// ============================================================
// فورم الزبون
// ============================================================

document.getElementById("customerForm").addEventListener("submit", function (e) {
    e.preventDefault();
    const name = document.getElementById("customerName").value.trim();
    const phone = document.getElementById("customerPhone").value.trim();
    if (!name) return;

    if (data.customers.find(c => c.name.toLowerCase() === name.toLowerCase())) {
        alert("الزبون موجود مسبقاً");
        return;
    }

    data.customers.push({ id: uid(), name, phone, debt: 0 });
    saveData();
    this.reset();
    renderAll();
    alert("✅ تمت إضافة الزبون");
});


// ============================================================
// فورم المجهز
// ============================================================

document.getElementById("supplierForm").addEventListener("submit", function (e) {
    e.preventDefault();
    const name = document.getElementById("supplierName").value.trim();
    const phone = document.getElementById("supplierPhone").value.trim();
    if (!name) return;

    if (data.suppliers.find(s => s.name.toLowerCase() === name.toLowerCase())) {
        alert("المجهز موجود مسبقاً");
        return;
    }

    data.suppliers.push({ id: uid(), name, phone, debt: 0 });
    saveData();
    this.reset();
    renderAll();
    alert("✅ تمت إضافة المجهز");
});


// ============================================================
// فورم المادة
// ============================================================

function toggleProductMulti() {
    const isMulti = document.getElementById("productMulti").checked;
    document.getElementById("multiFields").style.display = isMulti ? "contents" : "none";
    document.getElementById("multiPrices").style.display = isMulti ? "contents" : "none";
    document.getElementById("singleFields").style.display = isMulti ? "none" : "contents";
    document.getElementById("productQuantity").placeholder =
        isMulti ? "الكمية الابتدائية (طبقة)" : "الكمية الابتدائية";
}

document.getElementById("productForm").addEventListener("submit", function (e) {
    e.preventDefault();

    const name = document.getElementById("productName").value.trim();
    const isMulti = document.getElementById("productMulti").checked;
    if (!name) return;

    const existing = data.products.find(
        p => p.name.toLowerCase() === name.toLowerCase()
    );

    if (isMulti) {
        const unitMain = document.getElementById("productUnitMain").value.trim() || "كارتونة";
        const unitSmall = document.getElementById("productUnitSmall").value.trim() || "طبقة";
        const perMain = Number(document.getElementById("productPerMain").value) || 12;
        const qty = Number(document.getElementById("productQuantity").value) || 0;

        const buyPriceMain = Number(document.getElementById("productBuyPriceMain").value) || 0;
        const sellPriceMain = Number(document.getElementById("productSellPriceMain").value) || 0;
        const sellPriceSmall = Number(document.getElementById("productSellPriceSmall").value) || 0;

        if (existing) {
            existing.multi = true;
            existing.unitMain = unitMain;
            existing.unitSmall = unitSmall;
            existing.perMain = perMain;
            existing.stockSmall = (Number(existing.stockSmall) || 0) + qty;
            existing.buyPriceMain = buyPriceMain;
            existing.sellPriceMain = sellPriceMain;
            existing.sellPriceSmall = sellPriceSmall;
        } else {
            data.products.push({
                id: uid(),
                name,
                multi: true,
                unitMain,
                unitSmall,
                perMain,
                stockSmall: qty,
                buyPriceMain,
                sellPriceMain,
                sellPriceSmall
            });
        }
    } else {
        const qty = Number(document.getElementById("productQuantity").value) || 0;
        const buyPrice = Number(document.getElementById("productBuyPrice").value) || 0;
        const sellPrice = Number(document.getElementById("productSellPrice").value) || 0;

        if (existing) {
            existing.multi = false;
            existing.quantity = (Number(existing.quantity) || 0) + qty;
            existing.buyPrice = buyPrice;
            existing.sellPrice = sellPrice;
        } else {
            data.products.push({
                id: uid(),
                name,
                multi: false,
                quantity: qty,
                buyPrice,
                sellPrice
            });
        }
    }

    saveData();
    this.reset();
    toggleProductMulti();
    renderAll();
    alert("✅ تمت إضافة المادة");
});


// ============================================================
// فورم البيع
// ============================================================

function toggleSalePaid() {
    const v = document.getElementById("salePayment").value;
    document.getElementById("salePaid").style.display = v === "partial" ? "block" : "none";
}

function updateSaleUnitHint() {
    const productName = document.getElementById("saleProduct").value.trim();
    const unit = document.getElementById("saleUnit").value;
    const priceInput = document.getElementById("salePrice");
    const p = data.products.find(x => x.name.toLowerCase() === productName.toLowerCase());

    if (!p) return;

    if (p.multi) {
        if (unit === "main") {
            priceInput.value = p.sellPriceMain || 0;
        } else {
            priceInput.value = p.sellPriceSmall || 0;
        }
    } else {
        priceInput.value = p.sellPrice || 0;
    }
}

document.getElementById("saleProduct").addEventListener("input", updateSaleUnitHint);

document.getElementById("saleForm").addEventListener("submit", function (e) {
    e.preventDefault();

    const customerName = document.getElementById("saleCustomer").value.trim();
    const productName = document.getElementById("saleProduct").value.trim();
    const unit = document.getElementById("saleUnit").value;
    const quantity = Number(document.getElementById("saleQuantity").value);
    const price = Number(document.getElementById("salePrice").value);
    const payment = document.getElementById("salePayment").value;
    const paid = Number(document.getElementById("salePaid").value) || 0;

    if (!productName || quantity <= 0 || price < 0) {
        alert("تأكد من البيانات");
        return;
    }

    const product = data.products.find(
        p => p.name.toLowerCase() === productName.toLowerCase()
    );

    if (!product) {
        alert("المادة غير موجودة في المخزون");
        return;
    }

    const total = quantity * price;

    let actualPaid = total;
    if (payment === "debt") actualPaid = 0;
    if (payment === "partial") {
        if (paid <= 0 || paid >= total) {
            alert("المبلغ المدفوع يجب أن يكون أكبر من صفر وأقل من المجموع");
            return;
        }
        actualPaid = paid;
    }

    const debt = total - actualPaid;

    if (product.multi) {
        if (unit === "main") {
            const r = deductMain(product, quantity);
            if (!r.ok) { alert(r.message); return; }
        } else {
            const r = deductSmall(product, quantity);
            if (!r.ok) { alert(r.message); return; }
        }
    } else {
        if (Number(product.quantity) < quantity) {
            alert("الكمية غير كافية في المخزون");
            return;
        }
        product.quantity -= quantity;
    }

    const unitLabel = product.multi
        ? (unit === "main" ? (product.unitMain || "كارتونة") : (product.unitSmall || "طبقة"))
        : "وحدة";

    data.sales.push({
        id: uid(),
        customer: customerName || "زبون نقدي",
        product: productName,
        unit,
        unitLabel,
        quantity,
        price,
        total,
        paid: actualPaid,
        debt,
        payment,
        date: today()
    });

    if (debt > 0 && customerName) {
        let c = data.customers.find(
            x => x.name.toLowerCase() === customerName.toLowerCase()
        );
        if (!c) {
            c = { id: uid(), name: customerName, phone: "", debt: 0 };
            data.customers.push(c);
        }
        c.debt += debt;
    }

    saveData();
    this.reset();
    toggleSalePaid();
    renderAll();
    alert("✅ تم تسجيل البيع");
});


// ============================================================
// فورم الشراء
// ============================================================

function togglePurchasePaid() {
    const v = document.getElementById("purchasePayment").value;
    document.getElementById("purchasePaid").style.display = v === "partial" ? "block" : "none";
}

document.getElementById("purchaseForm").addEventListener("submit", function (e) {
    e.preventDefault();

    const supplierName = document.getElementById("purchaseSupplier").value.trim();
    const productName = document.getElementById("purchaseProduct").value.trim();
    const quantity = Number(document.getElementById("purchaseQuantity").value);
    const price = Number(document.getElementById("purchasePrice").value);
    const payment = document.getElementById("purchasePayment").value;
    const paid = Number(document.getElementById("purchasePaid").value) || 0;

    if (!productName || quantity <= 0 || price < 0) {
        alert("تأكد من البيانات");
        return;
    }

    const total = quantity * price;

    let actualPaid = total;
    if (payment === "debt") actualPaid = 0;
    if (payment === "partial") {
        if (paid <= 0 || paid >= total) {
            alert("المبلغ المدفوع يجب أن يكون أكبر من صفر وأقل من المجموع");
            return;
        }
        actualPaid = paid;
    }

    const debt = total - actualPaid;

    let product = data.products.find(
        p => p.name.toLowerCase() === productName.toLowerCase()
    );

    if (!product) {
        product = {
            id: uid(),
            name: productName,
            multi: true,
            unitMain: "كارتونة",
            unitSmall: "طبقة",
            perMain: 12,
            stockSmall: 0,
            buyPriceMain: price,
            sellPriceMain: 0,
            sellPriceSmall: 0
        };
        data.products.push(product);
    }

    if (product.multi) {
        addMain(product, quantity);
        product.buyPriceMain = price;
    } else {
        product.quantity = (Number(product.quantity) || 0) + quantity;
        product.buyPrice = price;
    }

    data.purchases.push({
        id: uid(),
        supplier: supplierName || "مجهز غير محدد",
        product: productName,
        unit: product.multi ? "main" : "unit",
        unitLabel: product.multi ? (product.unitMain || "كارتونة") : "وحدة",
        quantity,
        price,
        total,
        paid: actualPaid,
        debt,
        payment,
        date: today()
    });

    if (debt > 0 && supplierName) {
        let s = data.suppliers.find(
            x => x.name.toLowerCase() === supplierName.toLowerCase()
        );
        if (!s) {
            s = { id: uid(), name: supplierName, phone: "", debt: 0 };
            data.suppliers.push(s);
        }
        s.debt += debt;
    }

    saveData();
    this.reset();
    togglePurchasePaid();
    renderAll();
    alert("✅ تم تسجيل الشراء");
});


// ============================================================
// فورم المصاريف
// ============================================================

document.getElementById("expenseForm").addEventListener("submit", function (e) {
    e.preventDefault();
    const name = document.getElementById("expenseName").value.trim();
    const amount = Number(document.getElementById("expenseAmount").value);
    const note = document.getElementById("expenseNote").value.trim();

    if (!name || amount <= 0) {
        alert("تأكد من البيانات");
        return;
    }

    data.expenses.push({ id: uid(), name, amount, note, date: today() });
    saveData();
    this.reset();
    renderAll();
    alert("✅ تمت إضافة المصروف");
});


// ============================================================
// الحذف
// ============================================================

function deleteItem(type, id) {
    if (!confirm("هل أنت متأكد من الحذف؟")) return;
    data[type] = data[type].filter(item => item.id !== id);
    saveData();
    renderAll();
}


// ============================================================
// تسديد دين زبون
// ============================================================

function payCustomer(id) {
    const customer = data.customers.find(c => c.id === id);
    if (!customer || customer.debt <= 0) return;

    const amount = Number(prompt(
        `الزبون: ${customer.name}\nالدين الحالي: ${money(customer.debt)} د.ع\n\nكم دفع؟`
    ));

    if (!amount || amount <= 0) return;
    if (amount > customer.debt) {
        alert("المبلغ أكبر من الدين");
        return;
    }

    customer.debt -= amount;
    data.payments.push({
        id: uid(), type: "customer",
        person: customer.name, amount, date: today()
    });

    saveData();
    renderAll();
    alert("✅ تم تسجيل التسديد");
}


// ============================================================
// تسديد دين مجهز
// ============================================================

function paySupplier(id) {
    const supplier = data.suppliers.find(s => s.id === id);
    if (!supplier || supplier.debt <= 0) return;

    const amount = Number(prompt(
        `المجهز: ${supplier.name}\nالمستحق: ${money(supplier.debt)} د.ع\n\nكم دفعت؟`
    ));

    if (!amount || amount <= 0) return;
    if (amount > supplier.debt) {
        alert("المبلغ أكبر من الدين");
        return;
    }

    supplier.debt -= amount;
    data.payments.push({
        id: uid(), type: "supplier",
        person: supplier.name, amount, date: today()
    });

    saveData();
    renderAll();
    alert("✅ تم تسجيل التسديد");
}


// ============================================================
// عرض الزبائن
// ============================================================

function renderCustomers() {
    const c = document.getElementById("customersList");
    if (!c) return;
    const q = (document.getElementById("customersSearch")?.value || "").toLowerCase();

    let list = data.customers;
    if (q) list = list.filter(x =>
        x.name.toLowerCase().includes(q) ||
        (x.phone || "").toLowerCase().includes(q)
    );

    if (!list.length) {
        c.innerHTML = `<div class="empty">لا يوجد زبائن</div>`;
        return;
    }

    c.innerHTML = list.map(x => `
        <div class="item">
            <div class="item-info">
                <div class="item-title">${escapeHTML(x.name)}</div>
                <div class="item-details">
                    ${x.phone ? "📞 " + escapeHTML(x.phone) + "<br>" : ""}
                    الدين:
                    <span class="${x.debt > 0 ? "debt-positive" : ""}">
                        ${money(x.debt)} د.ع
                    </span>
                </div>
            </div>
            <div class="item-actions">
                <button class="history-btn" onclick="showCustomerHistory(${x.id})">📒 كشف</button>
                ${x.debt > 0
                    ? `<button class="pay-btn" onclick="payCustomer(${x.id})">💵 تسديد</button>`
                    : ""}
                <button class="delete-btn" onclick="deleteItem('customers', ${x.id})">حذف</button>
            </div>
        </div>
    `).join("");
}


// ============================================================
// عرض المجهزين
// ============================================================

function renderSuppliers() {
    const c = document.getElementById("suppliersList");
    if (!c) return;
    const q = (document.getElementById("suppliersSearch")?.value || "").toLowerCase();

    let list = data.suppliers;
    if (q) list = list.filter(x =>
        x.name.toLowerCase().includes(q) ||
        (x.phone || "").toLowerCase().includes(q)
    );

    if (!list.length) {
        c.innerHTML = `<div class="empty">لا يوجد مجهزين</div>`;
        return;
    }

    c.innerHTML = list.map(s => `
        <div class="item">
            <div class="item-info">
                <div class="item-title">${escapeHTML(s.name)}</div>
                <div class="item-details">
                    ${s.phone ? "📞 " + escapeHTML(s.phone) + "<br>" : ""}
                    علينا:
                    <span class="${s.debt > 0 ? "debt-positive" : ""}">
                        ${money(s.debt)} د.ع
                    </span>
                </div>
            </div>
            <div class="item-actions">
                <button class="history-btn" onclick="showSupplierHistory(${s.id})">📒 كشف</button>
                ${s.debt > 0
                    ? `<button class="pay-btn" onclick="paySupplier(${s.id})">💵 تسديد</button>`
                    : ""}
                <button class="delete-btn" onclick="deleteItem('suppliers', ${s.id})">حذف</button>
            </div>
        </div>
    `).join("");
}


// ============================================================
// عرض المخزون
// ============================================================

function renderProducts() {
    const c = document.getElementById("productsList");
    if (!c) return;
    const q = (document.getElementById("productsSearch")?.value || "").toLowerCase();

    let list = data.products;
    if (q) list = list.filter(p => p.name.toLowerCase().includes(q));

    if (!list.length) {
        c.innerHTML = `<div class="empty">لا توجد مواد</div>`;
    } else {
        c.innerHTML = list.map(p => `
            <div class="item">
                <div class="item-info">
                    <div class="item-title">
                        ${escapeHTML(p.name)}
                        ${p.multi ? ' <span style="color:#7c3aed;font-size:12px;">(متعددة الوحدات)</span>' : ''}
                    </div>
                    <div class="item-details">
                        المخزون: ${formatStock(p)}
                        <br>
                        ${p.multi
                            ? `شراء ${escapeHTML(p.unitMain || "كارتونة")}: ${money(p.buyPriceMain)} د.ع
                               <br>بيع ${escapeHTML(p.unitMain || "كارتونة")}: ${money(p.sellPriceMain)} د.ع
                               <br>بيع ${escapeHTML(p.unitSmall || "طبقة")}: ${money(p.sellPriceSmall)} د.ع`
                            : `شراء: ${money(p.buyPrice)} د.ع — بيع: ${money(p.sellPrice)} د.ع`
                        }
                    </div>
                </div>
                <div class="item-actions">
                    <button class="delete-btn" onclick="deleteItem('products', ${p.id})">حذف</button>
                </div>
            </div>
        `).join("");
    }

    const datalistEl = document.getElementById("productsDatalist");
    if (datalistEl) {
        datalistEl.innerHTML = data.products.map(p =>
            `<option value="${escapeHTML(p.name)}"></option>`
        ).join("");
    }
}


// ============================================================
// عرض المبيعات
// ============================================================

function renderSales() {
    const c = document.getElementById("salesList");
    if (!c) return;
    const q = (document.getElementById("salesSearch")?.value || "").toLowerCase();

    let list = [...data.sales].reverse();
    if (q) list = list.filter(s =>
        s.product.toLowerCase().includes(q) ||
        (s.customer || "").toLowerCase().includes(q)
    );

    if (!list.length) {
        c.innerHTML = `<div class="empty">لا توجد مبيعات</div>`;
        return;
    }

    c.innerHTML = list.map(s => `
        <div class="item">
            <div class="item-info">
                <div class="item-title">${escapeHTML(s.product)}</div>
                <div class="item-details">
                    الزبون: ${escapeHTML(s.customer)}<br>
                    ${s.quantity} ${escapeHTML(s.unitLabel || "وحدة")} × ${money(s.price)}
                    = <strong>${money(s.total)} د.ع</strong><br>
                    المدفوع: ${money(s.paid)} د.ع
                    ${s.debt > 0
                        ? `<br><span class="debt-positive">الدين: ${money(s.debt)} د.ع</span>`
                        : ""}
                    <br>📅 ${s.date}
                </div>
            </div>
            <div class="item-actions">
                <button class="print-btn" onclick="printSaleInvoice(${s.id})">🖨️</button>
                <button class="delete-btn" onclick="deleteItem('sales', ${s.id})">حذف</button>
            </div>
        </div>
    `).join("");
}


// ============================================================
// عرض المشتريات
// ============================================================

function renderPurchases() {
    const c = document.getElementById("purchasesList");
    if (!c) return;
    const q = (document.getElementById("purchasesSearch")?.value || "").toLowerCase();

    let list = [...data.purchases].reverse();
    if (q) list = list.filter(p =>
        p.product.toLowerCase().includes(q) ||
        (p.supplier || "").toLowerCase().includes(q)
    );

    if (!list.length) {
        c.innerHTML = `<div class="empty">لا توجد مشتريات</div>`;
        return;
    }

    c.innerHTML = list.map(p => `
        <div class="item">
            <div class="item-info">
                <div class="item-title">${escapeHTML(p.product)}</div>
                <div class="item-details">
                    المجهز: ${escapeHTML(p.supplier)}<br>
                    ${p.quantity} ${escapeHTML(p.unitLabel || "وحدة")} × ${money(p.price)}
                    = <strong>${money(p.total)} د.ع</strong><br>
                    المدفوع: ${money(p.paid)} د.ع
                    ${p.debt > 0
                        ? `<br><span class="debt-positive">علينا: ${money(p.debt)} د.ع</span>`
                        : ""}
                    <br>📅 ${p.date}
                </div>
            </div>
            <div class="item-actions">
                <button class="delete-btn" onclick="deleteItem('purchases', ${p.id})">حذف</button>
            </div>
        </div>
    `).join("");
}


// ============================================================
// عرض المصاريف
// ============================================================

function renderExpenses() {
    const c = document.getElementById("expensesList");
    if (!c) return;
    const q = (document.getElementById("expensesSearch")?.value || "").toLowerCase();

    let list = [...data.expenses].reverse();
    if (q) list = list.filter(e =>
        e.name.toLowerCase().includes(q) ||
        (e.note || "").toLowerCase().includes(q)
    );

    if (!list.length) {
        c.innerHTML = `<div class="empty">لا توجد مصاريف</div>`;
        return;
    }

    c.innerHTML = list.map(e => `
        <div class="item">
            <div class="item-info">
                <div class="item-title">${escapeHTML(e.name)}</div>
                <div class="item-details">
                    المبلغ: <strong>${money(e.amount)} د.ع</strong>
                    ${e.note ? "<br>" + escapeHTML(e.note) : ""}
                    <br>📅 ${e.date}
                </div>
            </div>
            <div class="item-actions">
                <button class="delete-btn" onclick="deleteItem('expenses', ${e.id})">حذف</button>
            </div>
        </div>
    `).join("");
}


// ============================================================
// عرض الديون
// ============================================================

function renderDebts() {
    const cEl = document.getElementById("customerDebts");
    const sEl = document.getElementById("supplierDebts");
    if (!cEl || !sEl) return;

    const cust = data.customers.filter(c => c.debt > 0);
    const sup = data.suppliers.filter(s => s.debt > 0);

    if (!cust.length) {
        cEl.innerHTML = `<div class="empty">ماكو ديون إلنا</div>`;
    } else {
        cEl.innerHTML = cust.map(c => `
            <div class="item">
                <div class="item-info">
                    <div class="item-title">${escapeHTML(c.name)}</div>
                    <div class="item-details">
                        عليه: <strong class="debt-positive">${money(c.debt)} د.ع</strong>
                    </div>
                </div>
                <div class="item-actions">
                    <button class="pay-btn" onclick="payCustomer(${c.id})">💵 تسديد</button>
                </div>
            </div>
        `).join("");
    }

    if (!sup.length) {
        sEl.innerHTML = `<div class="empty">ماكو ديون علينا</div>`;
    } else {
        sEl.innerHTML = sup.map(s => `
            <div class="item">
                <div class="item-info">
                    <div class="item-title">${escapeHTML(s.name)}</div>
                    <div class="item-details">
                        علينا: <strong class="debt-positive">${money(s.debt)} د.ع</strong>
                    </div>
                </div>
                <div class="item-actions">
                    <button class="pay-btn" onclick="paySupplier(${s.id})">💵 تسديد</button>
                </div>
            </div>
        `).join("");
    }
}


// ============================================================
// لوحة التحكم
// ============================================================

function renderDashboard() {
    const d = today();

    const todaySales = data.sales.filter(s => s.date === d)
        .reduce((sum, s) => sum + s.total, 0);
    const todayPurchases = data.purchases.filter(p => p.date === d)
        .reduce((sum, p) => sum + p.total, 0);
    const custDebt = data.customers.reduce((sum, c) => sum + c.debt, 0);
    const supDebt = data.suppliers.reduce((sum, s) => sum + s.debt, 0);
    const expenses = data.expenses.reduce((sum, e) => sum + e.amount, 0);

    const setText = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };

    setText("todaySales", money(todaySales));
    setText("todayPurchases", money(todayPurchases));
    setText("customersDebt", money(custDebt));
    setText("suppliersDebt", money(supDebt));
    setText("totalExpenses", money(expenses));
    setText("productsCount", data.products.length);

    setText("statCustomers", data.customers.length);
    setText("statSuppliers", data.suppliers.length);
    setText("statSales", data.sales.length);
    setText("statPurchases", data.purchases.length);

    const transactions = [
        ...data.sales.map(x => ({
            type: "بيع", name: x.product,
            amount: x.total, date: x.date, id: x.id
        })),
        ...data.purchases.map(x => ({
            type: "شراء", name: x.product,
            amount: x.total, date: x.date, id: x.id
        })),
        ...data.expenses.map(x => ({
            type: "مصروف", name: x.name,
            amount: x.amount, date: x.date, id: x.id
        }))
    ];

    const recent = transactions.slice(-8).reverse();
    const c = document.getElementById("recentTransactions");
    if (!c) return;

    if (!recent.length) {
        c.innerHTML = `<div class="empty">لا توجد عمليات</div>`;
        return;
    }

    c.innerHTML = recent.map(t => `
        <div class="item">
            <div class="item-info">
                <div class="item-title">${t.type}: ${escapeHTML(t.name)}</div>
                <div class="item-details">
                    ${money(t.amount)} د.ع — 📅 ${t.date}
                </div>
            </div>
        </div>
    `).join("");
}


// ============================================================
// 💾 النسخ الاحتياطي (Backup / Restore)
// ============================================================

function exportData() {
    const backup = {
        version: "2.0",
        exportDate: new Date().toISOString(),
        data: data
    };

    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `hisaabati-backup-${today()}.json`;
    a.click();

    URL.revokeObjectURL(url);
    alert("✅ تم تنزيل النسخة الاحتياطية");
}

function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!confirm("⚠️ سيتم استبدال كل البيانات الحالية. متأكد؟")) {
        event.target.value = "";
        return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const parsed = JSON.parse(e.target.result);
            const importedData = parsed.data || parsed;

            if (!importedData.customers && !importedData.sales) {
                alert("❌ ملف غير صالح");
                return;
            }

            data = {
                customers: importedData.customers || [],
                suppliers: importedData.suppliers || [],
                products: importedData.products || [],
                sales: importedData.sales || [],
                purchases: importedData.purchases || [],
                expenses: importedData.expenses || [],
                payments: importedData.payments || []
            };

            saveData();
            renderAll();
            alert("✅ تم استيراد البيانات بنجاح");
        } catch (err) {
            alert("❌ فشل قراءة الملف: " + err.message);
        }
    };
    reader.readAsText(file);
    event.target.value = "";
}

function quickBackup() {
    exportData();
}

function wipeAllData() {
    if (!confirm("⚠️⚠️ تحذير: سيتم حذف كل البيانات نهائياً!\n\nهل أنت متأكد؟")) return;
    if (!confirm("تأكيد نهائي: لا يمكن الرجوع بعد الحذف!\n\nهل أنت متأكد 100%؟")) return;

    data = {
        customers: [],
        suppliers: [],
        products: [],
        sales: [],
        purchases: [],
        expenses: [],
        payments: []
    };

    saveData();
    renderAll();
    alert("🗑️ تم حذف كل البيانات");
}

function renderBackupInfo() {
    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };
    set("bkCustomers", data.customers.length);
    set("bkSales", data.sales.length);
    set("bkPurchases", data.purchases.length);
    set("bkProducts", data.products.length);

    const lastSave = localStorage.getItem("accountingData_v2");
    const el = document.getElementById("bkLastSave");
    if (el && lastSave) {
        el.textContent = "الآن (البيانات محفوظة تلقائياً)";
    }
}


// ============================================================
// 💵 الخزنة (Cashbox)
// ============================================================

function buildCashMovements() {
    const movements = [];

    data.sales.forEach(s => {
        const paid = Number(s.paid) || 0;
        if (paid > 0) {
            movements.push({
                id: "sale-" + s.id,
                type: "in",
                label: "بيع: " + s.product,
                person: s.customer,
                amount: paid,
                date: s.date
            });
        }
    });

    data.purchases.forEach(p => {
        const paid = Number(p.paid) || 0;
        if (paid > 0) {
            movements.push({
                id: "purchase-" + p.id,
                type: "out",
                label: "شراء: " + p.product,
                person: p.supplier,
                amount: paid,
                date: p.date
            });
        }
    });

    data.expenses.forEach(e => {
        movements.push({
            id: "expense-" + e.id,
            type: "out",
            label: "مصروف: " + e.name,
            person: "",
            amount: Number(e.amount) || 0,
            date: e.date
        });
    });

    data.payments.forEach(p => {
        if (p.type === "customer") {
            movements.push({
                id: "pay-" + p.id,
                type: "in",
                label: "تسديد زبون",
                person: p.person,
                amount: Number(p.amount) || 0,
                date: p.date
            });
        } else if (p.type === "supplier") {
            movements.push({
                id: "pay-" + p.id,
                type: "out",
                label: "تسديد مجهز",
                person: p.person,
                amount: Number(p.amount) || 0,
                date: p.date
            });
        }
    });

    return movements.sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        return 0;
    });
}

function renderCashbox() {
    const movements = buildCashMovements();

    let totalIn = 0;
    let totalOut = 0;

    movements.forEach(m => {
        if (m.type === "in") totalIn += m.amount;
        else totalOut += m.amount;
    });

    const cash = totalIn - totalOut;

    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };

    set("cashNow", money(cash));
    set("cashIn", money(totalIn));
    set("cashOut", money(totalOut));

    const c = document.getElementById("cashboxList");
    if (!c) return;

    const q = (document.getElementById("cashSearch")?.value || "").toLowerCase();
    let list = movements;
    if (q) list = list.filter(m =>
        (m.label || "").toLowerCase().includes(q) ||
        (m.person || "").toLowerCase().includes(q)
    );

    if (!list.length) {
        c.innerHTML = `<div class="empty">لا توجد حركات</div>`;
        return;
    }

    c.innerHTML = list.map(m => `
        <div class="item">
            <div class="item-info">
                <div class="item-title">
                    ${m.type === "in" ? "📥" : "📤"} ${escapeHTML(m.label)}
                </div>
                <div class="item-details">
                    ${m.person ? escapeHTML(m.person) + " — " : ""}
                    📅 ${m.date}
                </div>
            </div>
            <div class="item-actions">
                <strong style="color:${m.type === "in" ? "#16a34a" : "#dc2626"};font-size:15px;">
                    ${m.type === "in" ? "+" : "-"} ${money(m.amount)} د.ع
                </strong>
            </div>
        </div>
    `).join("");
}


// ============================================================
// 🖨️ طباعة الفاتورة
// ============================================================

function printSaleInvoice(saleId) {
    const s = data.sales.find(x => x.id === saleId);
    if (!s) return;

    const html = `
        <div class="invoice-modal" onclick="if(event.target===this)closeInvoice()">
            <div class="invoice-box">
                <h2>🧾 فاتورة بيع</h2>
                <div class="invoice-sub">حساباتي — إدارة المبيعات</div>

                <div class="invoice-line">
                    <span>التاريخ:</span>
                    <strong>${s.date}</strong>
                </div>
                <div class="invoice-line">
                    <span>الزبون:</span>
                    <strong>${escapeHTML(s.customer)}</strong>
                </div>
                <div class="invoice-line">
                    <span>المادة:</span>
                    <strong>${escapeHTML(s.product)}</strong>
                </div>
                <div class="invoice-line">
                    <span>الوحدة:</span>
                    <strong>${escapeHTML(s.unitLabel || "وحدة")}</strong>
                </div>
                <div class="invoice-line">
                    <span>الكمية × السعر:</span>
                    <strong>${s.quantity} × ${money(s.price)}</strong>
                </div>

                <div class="invoice-total">
                    <span>المجموع:</span>
                    <span>${money(s.total)} د.ع</span>
                </div>

                <div class="invoice-line">
                    <span>المدفوع:</span>
                    <strong style="color:#16a34a;">${money(s.paid)} د.ع</strong>
                </div>

                ${s.debt > 0 ? `
                    <div class="invoice-line">
                        <span>الباقي (دين):</span>
                        <strong style="color:#dc2626;">${money(s.debt)} د.ع</strong>
                    </div>
                ` : `
                    <div class="invoice-line">
                        <span>الحالة:</span>
                        <strong style="color:#16a34a;">✅ مدفوع بالكامل</strong>
                    </div>
                `}

                <div class="invoice-actions">
                    <button class="invoice-print" onclick="window.print()">🖨️ طباعة</button>
                    <button class="invoice-close" onclick="closeInvoice()">إغلاق</button>
                </div>
            </div>
        </div>
    `;

    const div = document.createElement("div");
    div.id = "invoiceContainer";
    div.innerHTML = html;
    document.body.appendChild(div);
}

function closeInvoice() {
    const el = document.getElementById("invoiceContainer");
    if (el) el.remove();
}


// ============================================================
// 📒 كشف حساب (زبون / مجهز)
// ============================================================

function showCustomerHistory(customerId) {
    const c = data.customers.find(x => x.id === customerId);
    if (!c) return;

    const sales = data.sales.filter(s =>
        (s.customer || "").toLowerCase() === c.name.toLowerCase()
    );

    const payments = data.payments.filter(p =>
        p.type === "customer" && p.person === c.name
    );

    const totalSales = sales.reduce((sum, s) => sum + s.total, 0);
    const totalPaidDirect = sales.reduce((sum, s) => sum + s.paid, 0);
    const totalPayments = payments.reduce((sum, p) => sum + p.amount, 0);

    const rows = [
        ...sales.map(s => ({
            date: s.date,
            desc: `بيع: ${s.product} (${s.quantity} ${s.unitLabel || ""})`,
            debit: s.total,
            credit: s.paid
        })),
        ...payments.map(p => ({
            date: p.date,
            desc: "تسديد دين",
            debit: 0,
            credit: p.amount
        }))
    ].sort((a, b) => a.date < b.date ? 1 : -1);

    const html = `
        <div class="invoice-modal" onclick="if(event.target===this)closeInvoice()">
            <div class="invoice-box" style="max-width:700px;">
                <h2>📒 كشف حساب: ${escapeHTML(c.name)}</h2>
                <div class="invoice-sub">${c.phone ? "📞 " + escapeHTML(c.phone) : ""}</div>

                <div class="history-summary">
                    <div class="stat">
                        <span>إجمالي المبيعات</span>
                        <strong>${money(totalSales)} د.ع</strong>
                    </div>
                    <div class="stat">
                        <span>إجمالي المدفوع</span>
                        <strong style="color:#16a34a;">${money(totalPaidDirect + totalPayments)} د.ع</strong>
                    </div>
                    <div class="stat">
                        <span>الدين الحالي</span>
                        <strong style="color:#dc2626;">${money(c.debt)} د.ع</strong>
                    </div>
                    <div class="stat">
                        <span>عدد العمليات</span>
                        <strong>${rows.length}</strong>
                    </div>
                </div>

                ${rows.length ? `
                    <table class="history-table">
                        <thead>
                            <tr>
                                <th>التاريخ</th>
                                <th>البيان</th>
                                <th>مدين</th>
                                <th>دائن</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows.map(r => `
                                <tr>
                                    <td>${r.date}</td>
                                    <td>${escapeHTML(r.desc)}</td>
                                    <td>${r.debit ? money(r.debit) : "-"}</td>
                                    <td style="color:#16a34a;">${r.credit ? money(r.credit) : "-"}</td>
                                </tr>
                            `).join("")}
                        </tbody>
                    </table>
                ` : `<div class="empty">لا توجد عمليات</div>`}

                <div class="invoice-actions">
                    <button class="invoice-print" onclick="window.print()">🖨️ طباعة</button>
                    <button class="invoice-close" onclick="closeInvoice()">إغلاق</button>
                </div>
            </div>
        </div>
    `;

    const div = document.createElement("div");
    div.id = "invoiceContainer";
    div.innerHTML = html;
    document.body.appendChild(div);
}

function showSupplierHistory(supplierId) {
    const s = data.suppliers.find(x => x.id === supplierId);
    if (!s) return;

    const purchases = data.purchases.filter(p =>
        (p.supplier || "").toLowerCase() === s.name.toLowerCase()
    );

    const payments = data.payments.filter(p =>
        p.type === "supplier" && p.person === s.name
    );

    const totalPurchases = purchases.reduce((sum, p) => sum + p.total, 0);
    const totalPaidDirect = purchases.reduce((sum, p) => sum + p.paid, 0);
    const totalPayments = payments.reduce((sum, p) => sum + p.amount, 0);

    const rows = [
        ...purchases.map(p => ({
            date: p.date,
            desc: `شراء: ${p.product} (${p.quantity} ${p.unitLabel || ""})`,
            debit: p.total,
            credit: p.paid
        })),
        ...payments.map(p => ({
            date: p.date,
            desc: "تسديد للمجهز",
            debit: 0,
            credit: p.amount
        }))
    ].sort((a, b) => a.date < b.date ? 1 : -1);

    const html = `
        <div class="invoice-modal" onclick="if(event.target===this)closeInvoice()">
            <div class="invoice-box" style="max-width:700px;">
                <h2>📒 كشف حساب: ${escapeHTML(s.name)}</h2>
                <div class="invoice-sub">${s.phone ? "📞 " + escapeHTML(s.phone) : ""}</div>

                <div class="history-summary">
                    <div class="stat">
                        <span>إجمالي المشتريات</span>
                        <strong>${money(totalPurchases)} د.ع</strong>
                    </div>
                    <div class="stat">
                        <span>إجمالي المدفوع</span>
                        <strong style="color:#16a34a;">${money(totalPaidDirect + totalPayments)} د.ع</strong>
                    </div>
                    <div class="stat">
                        <span>الدين الحالي</span>
                        <strong style="color:#dc2626;">${money(s.debt)} د.ع</strong>
                    </div>
                    <div class="stat">
                        <span>عدد العمليات</span>
                        <strong>${rows.length}</strong>
                    </div>
                </div>

                ${rows.length ? `
                    <table class="history-table">
                        <thead>
                            <tr>
                                <th>التاريخ</th>
                                <th>البيان</th>
                                <th>مدين</th>
                                <th>دائن</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows.map(r => `
                                <tr>
                                    <td>${r.date}</td>
                                    <td>${escapeHTML(r.desc)}</td>
                                    <td>${r.debit ? money(r.debit) : "-"}</td>
                                    <td style="color:#16a34a;">${r.credit ? money(r.credit) : "-"}</td>
                                </tr>
                            `).join("")}
                        </tbody>
                    </table>
                ` : `<div class="empty">لا توجد عمليات</div>`}

                <div class="invoice-actions">
                    <button class="invoice-print" onclick="window.print()">🖨️ طباعة</button>
                    <button class="invoice-close" onclick="closeInvoice()">إغلاق</button>
                </div>
            </div>
        </div>
    `;

    const div = document.createElement("div");
    div.id = "invoiceContainer";
    div.innerHTML = html;
    document.body.appendChild(div);
}


// ============================================================
// تشغيل كل شيء
// ============================================================

function renderAll() {
    renderCustomers();
    renderSuppliers();
    renderProducts();
    renderSales();
    renderPurchases();
    renderExpenses();
    renderDebts();
    renderDashboard();
    renderCashbox();
    renderBackupInfo();
}

renderAll();