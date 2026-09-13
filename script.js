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

function restoreStock(p, unit, quantity) {
    if (!p) return;
    if (p.multi) {
        if (unit === "main") {
            const perMain = Number(p.perMain) || 12;
            p.stockSmall = (Number(p.stockSmall) || 0) + (quantity * perMain);
        } else {
            p.stockSmall = (Number(p.stockSmall) || 0) + quantity;
        }
    } else {
        p.quantity = (Number(p.quantity) || 0) + quantity;
    }
}

function removeStockForEdit(p, unit, quantity) {
    if (!p) return { ok: true };
    if (p.multi) {
        if (unit === "main") return deductMain(p, quantity);
        return deductSmall(p, quantity);
    } else {
        if (Number(p.quantity) < quantity) {
            return { ok: false, message: "الكمية غير كافية في المخزون" };
        }
        p.quantity -= quantity;
        return { ok: true };
    }
}

// ============================================================
// حساب المجموع الكلي للمخزون (دالة مستقلة)
// ============================================================

function renderInventorySummary() {
    let totalMains = 0;
    let totalSmalls = 0;
    let totalOthers = 0;

    data.products.forEach(p => {
        if (p.multi) {
            const parts = productStockParts(p);
            if (parts) {
                totalMains += parts.mains;
                totalSmalls += parts.small;
            }
        } else {
            totalOthers += Number(p.quantity) || 0;
        }
    });

    const setText = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = money(val);
    };

    setText("invTotalMains", totalMains);
    setText("invTotalSmalls", totalSmalls);
    setText("invTotalOthers", totalOthers);
    setText("invTotalProducts", data.products.length);
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
                id: uid(), name, multi: true,
                unitMain, unitSmall, perMain,
                stockSmall: qty,
                buyPriceMain, sellPriceMain, sellPriceSmall
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
                id: uid(), name, multi: false,
                quantity: qty, buyPrice, sellPrice
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
        priceInput.value = unit === "main" ? (p.sellPriceMain || 0) : (p.sellPriceSmall || 0);
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
        unit, unitLabel, quantity, price, total,
        paid: actualPaid, debt, payment,
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
            id: uid(), name: productName, multi: true,
            unitMain: "كارتونة", unitSmall: "طبقة", perMain: 12,
            stockSmall: 0, buyPriceMain: price,
            sellPriceMain: 0, sellPriceSmall: 0
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
        quantity, price, total,
        paid: actualPaid, debt, payment,
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
    if (!name || amount <= 0) { alert("تأكد من البيانات"); return; }

    data.expenses.push({ id: uid(), name, amount, note, date: today() });
    saveData();
    this.reset();
    renderAll();
    alert("✅ تمت إضافة المصروف");
});

// ============================================================
// الحذف الذكي
// ============================================================

function deleteSale(id) {
    const sale = data.sales.find(s => s.id === id);
    if (!sale) return;

    const product = data.products.find(
        p => p.name.toLowerCase() === sale.product.toLowerCase()
    );

    let msg = `⚠️ سيتم حذف هذه البيعة:\n\n`;
    msg += `📦 المادة: ${sale.product}\n`;
    msg += `🔢 الكمية: ${sale.quantity} ${sale.unitLabel || "وحدة"}\n`;
    msg += `💰 المجموع: ${money(sale.total)} د.ع\n\n`;
    msg += `سيتم إرجاع:\n`;
    if (product) {
        msg += `✅ ${sale.quantity} ${sale.unitLabel || "وحدة"} إلى المخزون\n`;
    }
    if (sale.debt > 0 && sale.customer && sale.customer !== "زبون نقدي") {
        msg += `✅ تقليل دين ${sale.customer} بـ ${money(sale.debt)} د.ع\n`;
    }
    if (sale.paid > 0) {
        msg += `✅ خصم ${money(sale.paid)} د.ع من الخزنة\n`;
    }
    msg += `\nمتأكد؟`;

    if (!confirm(msg)) return;

    if (product) {
        restoreStock(product, sale.unit, sale.quantity);
    }

    if (sale.debt > 0 && sale.customer && sale.customer !== "زبون نقدي") {
        const c = data.customers.find(
            x => x.name.toLowerCase() === sale.customer.toLowerCase()
        );
        if (c) {
            c.debt = Math.max(0, c.debt - sale.debt);
        }
    }

    data.sales = data.sales.filter(s => s.id !== id);
    saveData();
    renderAll();
    alert("✅ تم حذف البيعة وإرجاع كل شي");
}

function deletePurchase(id) {
    const purchase = data.purchases.find(p => p.id === id);
    if (!purchase) return;

    const product = data.products.find(
        p => p.name.toLowerCase() === purchase.product.toLowerCase()
    );

    let msg = `⚠️ سيتم حذف هذا الشراء:\n\n`;
    msg += `📦 المادة: ${purchase.product}\n`;
    msg += `🔢 الكمية: ${purchase.quantity} ${purchase.unitLabel || "وحدة"}\n`;
    msg += `💰 المجموع: ${money(purchase.total)} د.ع\n\n`;
    msg += `سيتم:\n`;
    if (product) {
        msg += `➖ سحب ${purchase.quantity} ${purchase.unitLabel || "وحدة"} من المخزون\n`;
    }
    if (purchase.debt > 0 && purchase.supplier && purchase.supplier !== "مجهز غير محدد") {
        msg += `✅ تقليل دين ${purchase.supplier} بـ ${money(purchase.debt)} د.ع\n`;
    }
    if (purchase.paid > 0) {
        msg += `✅ إرجاع ${money(purchase.paid)} د.ع إلى الخزنة\n`;
    }
    msg += `\nمتأكد؟`;

    if (!confirm(msg)) return;

    if (product) {
        if (product.multi) {
            if (purchase.unit === "main") {
                const perMain = Number(product.perMain) || 12;
                product.stockSmall = Math.max(0,
                    (Number(product.stockSmall) || 0) - (purchase.quantity * perMain));
            } else {
                product.stockSmall = Math.max(0,
                    (Number(product.stockSmall) || 0) - purchase.quantity);
            }
        } else {
            product.quantity = Math.max(0,
                (Number(product.quantity) || 0) - purchase.quantity);
        }
    }

    if (purchase.debt > 0 && purchase.supplier && purchase.supplier !== "مجهز غير محدد") {
        const s = data.suppliers.find(
            x => x.name.toLowerCase() === purchase.supplier.toLowerCase()
        );
        if (s) {
            s.debt = Math.max(0, s.debt - purchase.debt);
        }
    }

    data.purchases = data.purchases.filter(p => p.id !== id);
    saveData();
    renderAll();
    alert("✅ تم حذف الشراء وتعديل كل شي");
}

function deleteExpense(id) {
    if (!confirm("هل أنت متأكد من حذف هذا المصروف؟")) return;
    data.expenses = data.expenses.filter(e => e.id !== id);
    saveData();
    renderAll();
}

function deleteCustomer(id) {
    const c = data.customers.find(x => x.id === id);
    if (!c) return;

    const sales = data.sales.filter(
        s => (s.customer || "").toLowerCase() === c.name.toLowerCase()
    );
    const payments = data.payments.filter(
        p => p.type === "customer" && p.person === c.name
    );

    let msg = `⚠️ سيتم حذف الزبون: ${c.name}\n\n`;

    if (sales.length || payments.length || c.debt > 0) {
        msg += `📋 العمليات المرتبطة:\n`;
        if (sales.length) msg += `• ${sales.length} مبيعات\n`;
        if (payments.length) msg += `• ${payments.length} تسديدات\n`;
        if (c.debt > 0) msg += `• دين: ${money(c.debt)} د.ع\n`;
        msg += `\n`;

        if (sales.length) {
            const restore = confirm(
                msg +
                `هل تريد إرجاع المخزون للعمليات المرتبطة أيضاً؟\n\n` +
                `(موافق = يرجع المخزون، إلغاء = ما يرجع)`
            );
            if (restore) {
                sales.forEach(s => {
                    const p = data.products.find(
                        x => x.name.toLowerCase() === s.product.toLowerCase()
                    );
                    if (p) restoreStock(p, s.unit, s.quantity);
                });
            }
        }

        if (!confirm(`هل أنت متأكد 100% من حذف "${c.name}" وكل عملياته؟`)) return;
    } else {
        if (!confirm(msg + `حذف "${c.name}"؟`)) return;
    }

    data.sales = data.sales.filter(
        s => (s.customer || "").toLowerCase() !== c.name.toLowerCase()
    );

    data.payments = data.payments.filter(
        p => !(p.type === "customer" && p.person === c.name)
    );

    data.customers = data.customers.filter(x => x.id !== id);
    saveData();
    renderAll();
    alert("✅ تم حذف الزبون وكل عملياته");
}

function deleteSupplier(id) {
    const s = data.suppliers.find(x => x.id === id);
    if (!s) return;

    const purchases = data.purchases.filter(
        p => (p.supplier || "").toLowerCase() === s.name.toLowerCase()
    );
    const payments = data.payments.filter(
        p => p.type === "supplier" && p.person === s.name
    );

    let msg = `⚠️ سيتم حذف المجهز: ${s.name}\n\n`;

    if (purchases.length || payments.length || s.debt > 0) {
        msg += `📋 العمليات المرتبطة:\n`;
        if (purchases.length) msg += `• ${purchases.length} مشتريات\n`;
        if (payments.length) msg += `• ${payments.length} تسديدات\n`;
        if (s.debt > 0) msg += `• دين علينا: ${money(s.debt)} د.ع\n`;
        msg += `\n`;

        if (purchases.length) {
            const remove = confirm(
                msg +
                `هل تريد سحب المخزون للعمليات المرتبطة أيضاً؟\n\n` +
                `(موافق = يسحب المخزون، إلغاء = ما يسحب)`
            );
            if (remove) {
                purchases.forEach(p => {
                    const prod = data.products.find(
                        x => x.name.toLowerCase() === p.product.toLowerCase()
                    );
                    if (prod) {
                        if (prod.multi) {
                            const perMain = Number(prod.perMain) || 12;
                            if (p.unit === "main") {
                                prod.stockSmall = Math.max(0,
                                    (Number(prod.stockSmall) || 0) - (p.quantity * perMain));
                            } else {
                                prod.stockSmall = Math.max(0,
                                    (Number(prod.stockSmall) || 0) - p.quantity);
                            }
                        } else {
                            prod.quantity = Math.max(0,
                                (Number(prod.quantity) || 0) - p.quantity);
                        }
                    }
                });
            }
        }

        if (!confirm(`هل أنت متأكد 100% من حذف "${s.name}" وكل عملياته؟`)) return;
    } else {
        if (!confirm(msg + `حذف "${s.name}"؟`)) return;
    }

    data.purchases = data.purchases.filter(
        p => (p.supplier || "").toLowerCase() !== s.name.toLowerCase()
    );
    data.payments = data.payments.filter(
        p => !(p.type === "supplier" && p.person === s.name)
    );
    data.suppliers = data.suppliers.filter(x => x.id !== id);
    saveData();
    renderAll();
    alert("✅ تم حذف المجهز وكل عملياته");
}

function deleteProduct(id) {
    const p = data.products.find(x => x.id === id);
    if (!p) return;

    const sales = data.sales.filter(
        s => s.product.toLowerCase() === p.name.toLowerCase()
    );
    const purchases = data.purchases.filter(
        x => x.product.toLowerCase() === p.name.toLowerCase()
    );

    let msg = `⚠️ سيتم حذف المادة: ${p.name}\n\n`;

    if (sales.length || purchases.length) {
        msg += `📋 العمليات المرتبطة:\n`;
        if (sales.length) msg += `• ${sales.length} مبيعات\n`;
        if (purchases.length) msg += `• ${purchases.length} مشتريات\n`;
        msg += `\n`;

        if (sales.length) {
            const restore = confirm(
                msg +
                `هل تريد إرجاع المخزون للمبيعات المرتبطة أيضاً؟\n\n` +
                `(موافق = يرجع المخزون، إلغاء = ما يرجع)`
            );
            if (restore) {
                sales.forEach(s => {
                    restoreStock(p, s.unit, s.quantity);
                });
            }
        }

        if (!confirm(`هل أنت متأكد 100% من حذف "${p.name}" وكل عملياته؟`)) return;
    } else {
        if (!confirm(msg + `حذف "${p.name}"؟`)) return;
    }

    sales.forEach(s => {
        if (s.debt > 0 && s.customer && s.customer !== "زبون نقدي") {
            const c = data.customers.find(
                x => x.name.toLowerCase() === s.customer.toLowerCase()
            );
            if (c) c.debt = Math.max(0, c.debt - s.debt);
        }
    });
    purchases.forEach(pur => {
        if (pur.debt > 0 && pur.supplier && pur.supplier !== "مجهز غير محدد") {
            const sup = data.suppliers.find(
                x => x.name.toLowerCase() === pur.supplier.toLowerCase()
            );
            if (sup) sup.debt = Math.max(0, sup.debt - pur.debt);
        }
    });

    data.sales = data.sales.filter(
        s => s.product.toLowerCase() !== p.name.toLowerCase()
    );
    data.purchases = data.purchases.filter(
        x => x.product.toLowerCase() !== p.name.toLowerCase()
    );
    data.products = data.products.filter(x => x.id !== id);
    saveData();
    renderAll();
    alert("✅ تم حذف المادة وكل عملياتها");
}

// ============================================================
// التعديل (Edit Modal)
// ============================================================

let editContext = null;

function openEdit(type, id) {
    editContext = { type, id };
    const modal = document.getElementById("editModal");
    const title = document.getElementById("editTitle");
    const body = document.getElementById("editBody");
    body.innerHTML = "";

    if (type === "sale") {
        const s = data.sales.find(x => x.id === id);
        if (!s) return;
        title.textContent = "✏️ تعديل البيعة";

        body.innerHTML = `
            <label>الزبون</label>
            <input type="text" id="edit_sale_customer" value="${escapeHTML(s.customer)}">

            <label>المادة (غير قابلة للتعديل)</label>
            <input type="text" value="${escapeHTML(s.product)}" disabled>

            <label>الوحدة</label>
            <select id="edit_sale_unit">
                <option value="main" ${s.unit === "main" ? "selected" : ""}>كارتونة</option>
                <option value="small" ${s.unit === "small" ? "selected" : ""}>طبقة</option>
            </select>

            <label>الكمية</label>
            <input type="number" id="edit_sale_quantity" value="${s.quantity}" min="1">

            <label>سعر الوحدة</label>
            <input type="number" id="edit_sale_price" value="${s.price}" min="0">

            <label>نوع الدفع</label>
            <select id="edit_sale_payment">
                <option value="cash" ${s.payment === "cash" ? "selected" : ""}>نقدًا</option>
                <option value="debt" ${s.payment === "debt" ? "selected" : ""}>دين</option>
                <option value="partial" ${s.payment === "partial" ? "selected" : ""}>دفع جزئي</option>
            </select>

            <label>المبلغ المدفوع (لدفع جزئي فقط)</label>
            <input type="number" id="edit_sale_paid" value="${s.paid}" min="0">
        `;
    }

    if (type === "purchase") {
        const p = data.purchases.find(x => x.id === id);
        if (!p) return;
        title.textContent = "✏️ تعديل الشراء";

        body.innerHTML = `
            <label>المجهز</label>
            <input type="text" id="edit_pur_supplier" value="${escapeHTML(p.supplier)}">

            <label>المادة (غير قابلة للتعديل)</label>
            <input type="text" value="${escapeHTML(p.product)}" disabled>

            <label>الكمية</label>
            <input type="number" id="edit_pur_quantity" value="${p.quantity}" min="1">

            <label>سعر الوحدة</label>
            <input type="number" id="edit_pur_price" value="${p.price}" min="0">

            <label>نوع الدفع</label>
            <select id="edit_pur_payment">
                <option value="cash" ${p.payment === "cash" ? "selected" : ""}>نقدًا</option>
                <option value="debt" ${p.payment === "debt" ? "selected" : ""}>دين</option>
                <option value="partial" ${p.payment === "partial" ? "selected" : ""}>دفع جزئي</option>
            </select>

            <label>المبلغ المدفوع (لدفع جزئي فقط)</label>
            <input type="number" id="edit_pur_paid" value="${p.paid}" min="0">
        `;
    }

    if (type === "expense") {
        const e = data.expenses.find(x => x.id === id);
        if (!e) return;
        title.textContent = "✏️ تعديل المصروف";

        body.innerHTML = `
            <label>نوع المصروف</label>
            <input type="text" id="edit_exp_name" value="${escapeHTML(e.name)}">

            <label>المبلغ</label>
            <input type="number" id="edit_exp_amount" value="${e.amount}" min="0">

            <label>ملاحظات</label>
            <input type="text" id="edit_exp_note" value="${escapeHTML(e.note || "")}">
        `;
    }

    if (type === "customer") {
        const c = data.customers.find(x => x.id === id);
        if (!c) return;
        title.textContent = "✏️ تعديل الزبون";

        body.innerHTML = `
            <label>اسم الزبون</label>
            <input type="text" id="edit_cus_name" value="${escapeHTML(c.name)}">

            <label>رقم الهاتف</label>
            <input type="text" id="edit_cus_phone" value="${escapeHTML(c.phone || "")}">

            <label>الدين الحالي</label>
            <input type="number" id="edit_cus_debt" value="${c.debt}" min="0">
        `;
    }

    if (type === "supplier") {
        const s = data.suppliers.find(x => x.id === id);
        if (!s) return;
        title.textContent = "✏️ تعديل المجهز";

        body.innerHTML = `
            <label>اسم المجهز</label>
            <input type="text" id="edit_sup_name" value="${escapeHTML(s.name)}">

            <label>رقم الهاتف</label>
            <input type="text" id="edit_sup_phone" value="${escapeHTML(s.phone || "")}">

            <label>الدين الحالي</label>
            <input type="number" id="edit_sup_debt" value="${s.debt}" min="0">
        `;
    }

    if (type === "product") {
        const p = data.products.find(x => x.id === id);
        if (!p) return;
        title.textContent = "✏️ تعديل المادة";

        if (p.multi) {
            const { mains, small } = productStockParts(p);
            body.innerHTML = `
                <label>اسم المادة</label>
                <input type="text" id="edit_prod_name" value="${escapeHTML(p.name)}">

                <label>اسم الوحدة الكبيرة</label>
                <input type="text" id="edit_prod_unitmain" value="${escapeHTML(p.unitMain || "كارتونة")}">

                <label>اسم الوحدة الصغيرة</label>
                <input type="text" id="edit_prod_unitsmall" value="${escapeHTML(p.unitSmall || "طبقة")}">

                <label>كم طبقة بالكارتونة</label>
                <input type="number" id="edit_prod_permain" value="${p.perMain || 12}" min="1">

                <label>المخزون الحالي: ${mains} كارتونة + ${small} طبقة</label>
                <input type="number" id="edit_prod_stock" value="${p.stockSmall || 0}" min="0">
                <small style="color:#64748b;display:block;margin-top:-8px;margin-bottom:12px;">
                    (إجمالي الطبقات — مثلاً 12 = كارتونة واحدة)
                </small>

                <label>سعر شراء الكارتونة</label>
                <input type="number" id="edit_prod_buymain" value="${p.buyPriceMain || 0}" min="0">

                <label>سعر بيع الكارتونة</label>
                <input type="number" id="edit_prod_sellmain" value="${p.sellPriceMain || 0}" min="0">

                <label>سعر بيع الطبقة</label>
                <input type="number" id="edit_prod_sellsmall" value="${p.sellPriceSmall || 0}" min="0">
            `;
        } else {
            body.innerHTML = `
                <label>اسم المادة</label>
                <input type="text" id="edit_prod_name" value="${escapeHTML(p.name)}">

                <label>الكمية</label>
                <input type="number" id="edit_prod_qty" value="${p.quantity || 0}" min="0">

                <label>سعر الشراء</label>
                <input type="number" id="edit_prod_buy" value="${p.buyPrice || 0}" min="0">

                <label>سعر البيع</label>
                <input type="number" id="edit_prod_sell" value="${p.sellPrice || 0}" min="0">
            `;
        }
    }

    modal.style.display = "flex";
}

function closeEdit() {
    document.getElementById("editModal").style.display = "none";
    editContext = null;
}

function saveEdit() {
    if (!editContext) return;
    const { type, id } = editContext;

    if (type === "sale") {
        const s = data.sales.find(x => x.id === id);
        if (!s) return;

        const newUnit = document.getElementById("edit_sale_unit").value;
        const newQty = Number(document.getElementById("edit_sale_quantity").value);
        const newPrice = Number(document.getElementById("edit_sale_price").value);
        const newPayment = document.getElementById("edit_sale_payment").value;
        const newPaidInput = Number(document.getElementById("edit_sale_paid").value) || 0;
        const newCustomer = document.getElementById("edit_sale_customer").value.trim() || "زبون نقدي";

        if (newQty <= 0 || newPrice < 0) {
            alert("تأكد من الكمية والسعر");
            return;
        }

        const product = data.products.find(
            p => p.name.toLowerCase() === s.product.toLowerCase()
        );

        if (product) restoreStock(product, s.unit, s.quantity);

        if (product) {
            const r = removeStockForEdit(product, newUnit, newQty);
            if (!r.ok) {
                if (product) restoreStock(product, s.unit, 0);
                alert(r.message);
                return;
            }
        }

        const newTotal = newQty * newPrice;
        let newActualPaid = newTotal;
        if (newPayment === "debt") newActualPaid = 0;
        if (newPayment === "partial") {
            if (newPaidInput <= 0 || newPaidInput >= newTotal) {
                alert("المبلغ المدفوع غير صحيح");
                return;
            }
            newActualPaid = newPaidInput;
        }
        const newDebt = newTotal - newActualPaid;

        if (s.debt > 0 && s.customer && s.customer !== "زبون نقدي") {
            const oldC = data.customers.find(
                x => x.name.toLowerCase() === s.customer.toLowerCase()
            );
            if (oldC) oldC.debt = Math.max(0, oldC.debt - s.debt);
        }

        if (newDebt > 0 && newCustomer && newCustomer !== "زبون نقدي") {
            let nc = data.customers.find(
                x => x.name.toLowerCase() === newCustomer.toLowerCase()
            );
            if (!nc) {
                nc = { id: uid(), name: newCustomer, phone: "", debt: 0 };
                data.customers.push(nc);
            }
            nc.debt += newDebt;
        }

        s.customer = newCustomer;
        s.unit = newUnit;
        s.unitLabel = product && product.multi
            ? (newUnit === "main" ? (product.unitMain || "كارتونة") : (product.unitSmall || "طبقة"))
            : "وحدة";
        s.quantity = newQty;
        s.price = newPrice;
        s.total = newTotal;
        s.payment = newPayment;
        s.paid = newActualPaid;
        s.debt = newDebt;

        saveData();
        closeEdit();
        renderAll();
        alert("✅ تم تعديل البيعة");
    }

    if (type === "purchase") {
        const p = data.purchases.find(x => x.id === id);
        if (!p) return;

        const newQty = Number(document.getElementById("edit_pur_quantity").value);
        const newPrice = Number(document.getElementById("edit_pur_price").value);
        const newPayment = document.getElementById("edit_pur_payment").value;
        const newPaidInput = Number(document.getElementById("edit_pur_paid").value) || 0;
        const newSupplier = document.getElementById("edit_pur_supplier").value.trim() || "مجهز غير محدد";

        if (newQty <= 0 || newPrice < 0) {
            alert("تأكد من الكمية والسعر");
            return;
        }

        const product = data.products.find(
            x => x.name.toLowerCase() === p.product.toLowerCase()
        );

        if (product) {
            if (product.multi) {
                const perMain = Number(product.perMain) || 12;
                if (p.unit === "main") {
                    product.stockSmall = Math.max(0,
                        (Number(product.stockSmall) || 0) - (p.quantity * perMain));
                } else {
                    product.stockSmall = Math.max(0,
                        (Number(product.stockSmall) || 0) - p.quantity);
                }
            } else {
                product.quantity = Math.max(0,
                    (Number(product.quantity) || 0) - p.quantity);
            }

            if (product.multi) {
                addMain(product, newQty);
            } else {
                product.quantity = (Number(product.quantity) || 0) + newQty;
            }
        }

        const newTotal = newQty * newPrice;
        let newActualPaid = newTotal;
        if (newPayment === "debt") newActualPaid = 0;
        if (newPayment === "partial") {
            if (newPaidInput <= 0 || newPaidInput >= newTotal) {
                alert("المبلغ المدفوع غير صحيح");
                return;
            }
            newActualPaid = newPaidInput;
        }
        const newDebt = newTotal - newActualPaid;

        if (p.debt > 0 && p.supplier && p.supplier !== "مجهز غير محدد") {
            const oldS = data.suppliers.find(
                x => x.name.toLowerCase() === p.supplier.toLowerCase()
            );
            if (oldS) oldS.debt = Math.max(0, oldS.debt - p.debt);
        }

        if (newDebt > 0 && newSupplier && newSupplier !== "مجهز غير محدد") {
            let ns = data.suppliers.find(
                x => x.name.toLowerCase() === newSupplier.toLowerCase()
            );
            if (!ns) {
                ns = { id: uid(), name: newSupplier, phone: "", debt: 0 };
                data.suppliers.push(ns);
            }
            ns.debt += newDebt;
        }

        p.supplier = newSupplier;
        p.quantity = newQty;
        p.price = newPrice;
        p.total = newTotal;
        p.payment = newPayment;
        p.paid = newActualPaid;
        p.debt = newDebt;

        saveData();
        closeEdit();
        renderAll();
        alert("✅ تم تعديل الشراء");
    }

    if (type === "expense") {
        const e = data.expenses.find(x => x.id === id);
        if (!e) return;

        const newName = document.getElementById("edit_exp_name").value.trim();
        const newAmount = Number(document.getElementById("edit_exp_amount").value);
        const newNote = document.getElementById("edit_exp_note").value.trim();

        if (!newName || newAmount <= 0) {
            alert("تأكد من البيانات");
            return;
        }

        e.name = newName;
        e.amount = newAmount;
        e.note = newNote;

        saveData();
        closeEdit();
        renderAll();
        alert("✅ تم تعديل المصروف");
    }

    if (type === "customer") {
        const c = data.customers.find(x => x.id === id);
        if (!c) return;

        const newName = document.getElementById("edit_cus_name").value.trim();
        const newPhone = document.getElementById("edit_cus_phone").value.trim();
        const newDebt = Number(document.getElementById("edit_cus_debt").value) || 0;

        if (!newName) { alert("الاسم مطلوب"); return; }

        const oldName = c.name;

        if (oldName !== newName) {
            data.sales.forEach(s => {
                if ((s.customer || "").toLowerCase() === oldName.toLowerCase()) {
                    s.customer = newName;
                }
            });
            data.payments.forEach(p => {
                if (p.type === "customer" && p.person === oldName) {
                    p.person = newName;
                }
            });
        }

        c.name = newName;
        c.phone = newPhone;
        c.debt = newDebt;

        saveData();
        closeEdit();
        renderAll();
        alert("✅ تم تعديل الزبون");
    }

    if (type === "supplier") {
        const s = data.suppliers.find(x => x.id === id);
        if (!s) return;

        const newName = document.getElementById("edit_sup_name").value.trim();
        const newPhone = document.getElementById("edit_sup_phone").value.trim();
        const newDebt = Number(document.getElementById("edit_sup_debt").value) || 0;

        if (!newName) { alert("الاسم مطلوب"); return; }

        const oldName = s.name;

        if (oldName !== newName) {
            data.purchases.forEach(p => {
                if ((p.supplier || "").toLowerCase() === oldName.toLowerCase()) {
                    p.supplier = newName;
                }
            });
            data.payments.forEach(p => {
                if (p.type === "supplier" && p.person === oldName) {
                    p.person = newName;
                }
            });
        }

        s.name = newName;
        s.phone = newPhone;
        s.debt = newDebt;

        saveData();
        closeEdit();
        renderAll();
        alert("✅ تم تعديل المجهز");
    }

    if (type === "product") {
        const p = data.products.find(x => x.id === id);
        if (!p) return;

        const newName = document.getElementById("edit_prod_name").value.trim();
        if (!newName) { alert("الاسم مطلوب"); return; }

        const oldName = p.name;

        if (p.multi) {
            p.unitMain = document.getElementById("edit_prod_unitmain").value.trim() || "كارتونة";
            p.unitSmall = document.getElementById("edit_prod_unitsmall").value.trim() || "طبقة";
            p.perMain = Number(document.getElementById("edit_prod_permain").value) || 12;
            p.stockSmall = Number(document.getElementById("edit_prod_stock").value) || 0;
            p.buyPriceMain = Number(document.getElementById("edit_prod_buymain").value) || 0;
            p.sellPriceMain = Number(document.getElementById("edit_prod_sellmain").value) || 0;
            p.sellPriceSmall = Number(document.getElementById("edit_prod_sellsmall").value) || 0;
        } else {
            p.quantity = Number(document.getElementById("edit_prod_qty").value) || 0;
            p.buyPrice = Number(document.getElementById("edit_prod_buy").value) || 0;
            p.sellPrice = Number(document.getElementById("edit_prod_sell").value) || 0;
        }

        if (oldName !== newName) {
            data.sales.forEach(s => {
                if (s.product.toLowerCase() === oldName.toLowerCase()) {
                    s.product = newName;
                }
            });
            data.purchases.forEach(x => {
                if (x.product.toLowerCase() === oldName.toLowerCase()) {
                    x.product = newName;
                }
            });
        }

        p.name = newName;

        saveData();
        closeEdit();
        renderAll();
        alert("✅ تم تعديل المادة");
    }
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
                <button class="edit-btn" onclick="openEdit('customer', ${x.id})">✏️</button>
                ${x.debt > 0
                    ? `<button class="pay-btn" onclick="payCustomer(${x.id})">💵 تسديد</button>`
                    : ""}
                <button class="delete-btn" onclick="deleteCustomer(${x.id})">🗑️</button>
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
                <button class="edit-btn" onclick="openEdit('supplier', ${s.id})">✏️</button>
                ${s.debt > 0
                    ? `<button class="pay-btn" onclick="paySupplier(${s.id})">💵 تسديد</button>`
                    : ""}
                <button class="delete-btn" onclick="deleteSupplier(${s.id})">🗑️</button>
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
                    <button class="edit-btn" onclick="openEdit('product', ${p.id})">✏️</button>
                    <button class="delete-btn" onclick="deleteProduct(${p.id})">🗑️</button>
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
                <button class="edit-btn" onclick="openEdit('sale', ${s.id})">✏️</button>
                <button class="delete-btn" onclick="deleteSale(${s.id})">🗑️</button>
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
                <button class="edit-btn" onclick="openEdit('purchase', ${p.id})">✏️</button>
                <button class="delete-btn" onclick="deletePurchase(${p.id})">🗑️</button>
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
                <button class="edit-btn" onclick="openEdit('expense', ${e.id})">✏️</button>
                <button class="delete-btn" onclick="deleteExpense(${e.id})">🗑️</button>
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
                    <button class="history-btn" onclick="showCustomerHistory(${c.id})">📒</button>
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
                    <button class="history-btn" onclick="showSupplierHistory(${s.id})">📒</button>
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
// تسديد دين
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
// الخزنة
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
// طباعة الفاتورة
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
// كشف حساب
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
// النسخة الاحتياطية (HTML)
// ============================================================

function exportData() {
    const now = new Date();
    const dateStr = now.toLocaleDateString("ar-IQ", {
        weekday: "long", year: "numeric", month: "long", day: "numeric"
    });
    const timeStr = now.toLocaleTimeString("ar-IQ");

    let html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>حساباتي — نسخة احتياطية</title>
<style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
        font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
        background: #f1f5f9;
        color: #1e293b;
        line-height: 1.7;
        padding: 20px;
    }
    .container { max-width: 1000px; margin: auto; }
    .header {
        background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
        color: white;
        padding: 30px;
        border-radius: 16px;
        margin-bottom: 24px;
        text-align: center;
    }
    .header h1 { font-size: 28px; margin-bottom: 8px; }
    .header .meta { color: #cbd5e1; font-size: 14px; margin-top: 6px; }
    .section {
        background: white;
        border-radius: 14px;
        padding: 20px;
        margin-bottom: 18px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.06);
    }
    .section h2 {
        color: #1e293b;
        font-size: 20px;
        margin-bottom: 16px;
        padding-bottom: 10px;
        border-bottom: 2px solid #e2e8f0;
    }
    .stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 12px;
    }
    .stat {
        background: #f8fafc;
        padding: 16px;
        border-radius: 10px;
        text-align: center;
        border: 1px solid #e2e8f0;
    }
    .stat span { display: block; font-size: 13px; color: #64748b; margin-bottom: 6px; }
    .stat strong { font-size: 22px; color: #2563eb; }
    .card {
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        padding: 14px;
        margin-bottom: 10px;
    }
    .card-title { font-weight: 700; margin-bottom: 6px; font-size: 15px; }
    .card-details { color: #64748b; font-size: 13px; line-height: 1.9; }
    .card-details strong { color: #1e293b; }
    .badge {
        display: inline-block;
        padding: 4px 10px;
        border-radius: 8px;
        font-size: 12px;
        font-weight: 600;
        margin-left: 4px;
    }
    .badge-blue { background: #dbeafe; color: #1e40af; }
    .badge-orange { background: #fef3c7; color: #92400e; }
    .badge-red { background: #fee2e2; color: #991b1b; }
    .badge-green { background: #dcfce7; color: #166534; }
    .empty {
        text-align: center;
        color: #94a3b8;
        padding: 20px;
        font-style: italic;
    }
    .footer {
        text-align: center;
        color: #64748b;
        font-size: 13px;
        margin-top: 30px;
        padding: 20px;
    }
    @media print {
        body { background: white; padding: 0; }
        .section { box-shadow: none; page-break-inside: avoid; }
    }
</style>
</head>
<body>
<div class="container">

<div class="header">
    <h1>🏪 حساباتي — نسخة احتياطية</h1>
    <div class="meta">📅 ${dateStr}</div>
    <div class="meta">⏰ ${timeStr}</div>
</div>

<div class="section">
    <h2>📊 الملخص العام</h2>
    <div class="stats">
        <div class="stat"><span>👥 الزبائن</span><strong>${data.customers.length}</strong></div>
        <div class="stat"><span>🏪 المجهزين</span><strong>${data.suppliers.length}</strong></div>
        <div class="stat"><span>📦 المواد</span><strong>${data.products.length}</strong></div>
        <div class="stat"><span>💰 المبيعات</span><strong>${data.sales.length}</strong></div>
        <div class="stat"><span>🛒 المشتريات</span><strong>${data.purchases.length}</strong></div>
        <div class="stat"><span>💸 المصاريف</span><strong>${data.expenses.length}</strong></div>
        <div class="stat"><span>👤 ديون لنا</span><strong>${money(data.customers.reduce((s,c)=>s+c.debt,0))}</strong></div>
        <div class="stat"><span>🏪 ديون علينا</span><strong>${money(data.suppliers.reduce((s,c)=>s+c.debt,0))}</strong></div>
    </div>
</div>

<div class="section">
    <h2>👥 الزبائن (${data.customers.length})</h2>
    ${data.customers.length ? data.customers.map(c => `
        <div class="card">
            <div class="card-title">${escapeHTML(c.name)}</div>
            <div class="card-details">
                ${c.phone ? "📞 " + escapeHTML(c.phone) + "<br>" : ""}
                الدين: <strong>${money(c.debt)} د.ع</strong>
            </div>
        </div>
    `).join("") : `<div class="empty">لا يوجد زبائن</div>`}
</div>

<div class="section">
    <h2>🏪 المجهزين (${data.suppliers.length})</h2>
    ${data.suppliers.length ? data.suppliers.map(s => `
        <div class="card">
            <div class="card-title">${escapeHTML(s.name)}</div>
            <div class="card-details">
                ${s.phone ? "📞 " + escapeHTML(s.phone) + "<br>" : ""}
                علينا: <strong>${money(s.debt)} د.ع</strong>
            </div>
        </div>
    `).join("") : `<div class="empty">لا يوجد مجهزين</div>`}
</div>

<div class="section">
    <h2>📦 المواد (${data.products.length})</h2>
    ${data.products.length ? data.products.map(p => {
        let stockText = "";
        if (p.multi) {
            const { mains, small } = productStockParts(p);
            stockText = `<span class="badge badge-blue">${mains} ${escapeHTML(p.unitMain || "كارتونة")}</span>`;
            if (small > 0) {
                stockText += ` <span class="badge badge-orange">فرط: ${small} ${escapeHTML(p.unitSmall || "طبقة")}</span>`;
            }
        } else {
            stockText = `<span class="badge badge-blue">${money(p.quantity)} وحدة</span>`;
        }
        return `
            <div class="card">
                <div class="card-title">${escapeHTML(p.name)}</div>
                <div class="card-details">
                    المخزون: ${stockText}<br>
                    ${p.multi
                        ? `شراء الكارتونة: <strong>${money(p.buyPriceMain)} د.ع</strong><br>
                           بيع الكارتونة: <strong>${money(p.sellPriceMain)} د.ع</strong><br>
                           بيع الطبقة: <strong>${money(p.sellPriceSmall)} د.ع</strong>`
                        : `شراء: <strong>${money(p.buyPrice)} د.ع</strong> — بيع: <strong>${money(p.sellPrice)} د.ع</strong>`
                    }
                </div>
            </div>
        `;
    }).join("") : `<div class="empty">لا توجد مواد</div>`}
</div>

<div class="section">
    <h2>💰 المبيعات (${data.sales.length})</h2>
    ${data.sales.length ? [...data.sales].reverse().map(s => `
        <div class="card">
            <div class="card-title">${escapeHTML(s.product)}</div>
            <div class="card-details">
                الزبون: <strong>${escapeHTML(s.customer)}</strong><br>
                ${s.quantity} ${escapeHTML(s.unitLabel || "وحدة")} × ${money(s.price)}
                = <strong>${money(s.total)} د.ع</strong><br>
                المدفوع: ${money(s.paid)} د.ع
                ${s.debt > 0 ? ` — <span class="badge badge-red">دين: ${money(s.debt)} د.ع</span>` : ""}
                <br>📅 ${s.date}
            </div>
        </div>
    `).join("") : `<div class="empty">لا توجد مبيعات</div>`}
</div>

<div class="section">
    <h2>🛒 المشتريات (${data.purchases.length})</h2>
    ${data.purchases.length ? [...data.purchases].reverse().map(p => `
        <div class="card">
            <div class="card-title">${escapeHTML(p.product)}</div>
            <div class="card-details">
                المجهز: <strong>${escapeHTML(p.supplier)}</strong><br>
                ${p.quantity} ${escapeHTML(p.unitLabel || "وحدة")} × ${money(p.price)}
                = <strong>${money(p.total)} د.ع</strong><br>
                المدفوع: ${money(p.paid)} د.ع
                ${p.debt > 0 ? ` — <span class="badge badge-red">علينا: ${money(p.debt)} د.ع</span>` : ""}
                <br>📅 ${p.date}
            </div>
        </div>
    `).join("") : `<div class="empty">لا توجد مشتريات</div>`}
</div>

<div class="section">
    <h2>💸 المصاريف (${data.expenses.length})</h2>
    ${data.expenses.length ? [...data.expenses].reverse().map(e => `
        <div class="card">
            <div class="card-title">${escapeHTML(e.name)}</div>
            <div class="card-details">
                المبلغ: <strong>${money(e.amount)} د.ع</strong>
                ${e.note ? "<br>" + escapeHTML(e.note) : ""}
                <br>📅 ${e.date}
            </div>
        </div>
    `).join("") : `<div class="empty">لا توجد مصاريف</div>`}
</div>

<div class="footer">
    © حساباتي — تم إنشاء هذه النسخة بتاريخ ${dateStr} الساعة ${timeStr}
</div>

</div>

<script type="application/json" id="backupData">
${JSON.stringify(data).replace(/</g, "\\u003c")}
</script>

</body>
</html>`;

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    const h = String(now.getHours()).padStart(2, "0");
    const mi = String(now.getMinutes()).padStart(2, "0");

    const a = document.createElement("a");
    a.href = url;
    a.download = `حساباتي-${y}-${m}-${d}-${h}${mi}.html`;
    a.click();

    URL.revokeObjectURL(url);
    alert("✅ تم تنزيل النسخة الاحتياطية بنجاح");
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
            const content = e.target.result;
            let importedData = null;

            if (content.includes('id="backupData"')) {
                const match = content.match(/<script type="application\/json" id="backupData">([\s\S]*?)<\/script>/);
                if (match) {
                    importedData = JSON.parse(match[1]);
                }
            } else {
                const parsed = JSON.parse(content);
                importedData = parsed["بيانات"] || parsed.data || parsed;
            }

            if (!importedData || (!importedData.customers && !importedData.sales)) {
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

    const el = document.getElementById("bkLastSave");
    if (el) {
        el.textContent = new Date().toLocaleString("ar-IQ");
    }
}

// ============================================================
// تشغيل كل شيء
// ============================================================

function renderAll() {
    renderCustomers();
    renderSuppliers();
    renderProducts();
    renderInventorySummary();
    renderSales();
    renderPurchases();
    renderExpenses();
    renderDebts();
    renderDashboard();
    renderCashbox();
    renderBackupInfo();
}

renderAll();
