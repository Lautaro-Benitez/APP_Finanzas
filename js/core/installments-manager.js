// js/core/installments-manager.js


export class InstallmentsManager {
  constructor(storage, auth, walletManager, transactions) {
    this.storage = storage;
    this.auth = auth;
    this.walletManager = walletManager;
    this.transactions = transactions;
  }

  // ✅ Verificar y procesar cuotas pendientes
  async processAutomaticCharges() {
    try {
      console.log('🔄 Verificando cuotas pendientes...');

      const today = new Date();
      const cards = await this.storage.getCards();
      const transactions = await this.storage.getTransactions();

      // Filtrar tarjetas de crédito con wallet asociada y día de vencimiento
      const creditCardsWithDueDay = cards.filter(card =>
        card.type === 'Crédito' &&
        card.walletId &&
        card.dueDay
      );

      if (creditCardsWithDueDay.length === 0) {
        console.log('No hay tarjetas configuradas para descuento automático');
        return { processed: 0, errors: [] };
      }

      let processed = 0;
      let errors = [];

      for (const card of creditCardsWithDueDay) {
        try {
          // Verificar si es el día de vencimiento
          if (today.getDate() === card.dueDay) {
            const result = await this.processCardCharges(card, transactions);
            processed += result.charged;

            if (result.errors.length > 0) {
              errors.push(...result.errors);
            }
          }
        } catch (error) {
          console.error(`Error procesando tarjeta ${card.name}:`, error);
          errors.push({
            card: card.name,
            error: error.message
          });
        }
      }

      console.log(`✅ Procesadas ${processed} cuotas automáticamente`);

      return { processed, errors };

    } catch (error) {
      console.error('Error en processAutomaticCharges:', error);
      throw error;
    }
  }

  // ✅ Procesar cuotas de una tarjeta específica
  async processCardCharges(card, transactions) {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    let charged = 0;
    let errors = [];

    // Buscar todas las cuotas de esta tarjeta que vencen este mes
    const pendingInstallments = transactions.filter(tx =>
      tx.card === card.name &&
      tx.isInstallment &&
      tx.installmentInfo &&
      !tx.autoCharged && // No ha sido cobrada automáticamente
      tx.paymentMethod === 'Crédito'
    );

    console.log(`📋 Cuotas pendientes para ${card.name}:`, pendingInstallments.length);

    for (const installment of pendingInstallments) {
      try {
        const txDate = new Date(installment.date);
        const txMonth = txDate.getMonth();
        const txYear = txDate.getFullYear();

        // Verificar si la cuota es de este mes
        if (txMonth === currentMonth && txYear === currentYear) {
          // Verificar saldo en wallet
          const wallet = await this.walletManager.getById(card.walletId);

          if (wallet.currentBalance >= installment.amount) {
            // Descontar de wallet
            await this.walletManager.updateBalance(
              card.walletId,
              installment.amount,
              'subtract'
            );

            // Marcar transacción como cobrada automáticamente
            const index = transactions.findIndex(t => t.id === installment.id);
            if (index !== -1) {
              transactions[index].autoCharged = true;
              transactions[index].autoChargedDate = new Date().toISOString();
              transactions[index].updatedAt = new Date().toISOString();
            }

            charged++;

            console.log(`✅ Cuota ${installment.installmentInfo.current}/${installment.installmentInfo.total} de ${card.name} descontada: ${installment.amount}`);

          } else {
            errors.push({
              card: card.name,
              installment: `${installment.installmentInfo.current}/${installment.installmentInfo.total}`,
              amount: installment.amount,
              walletBalance: wallet.currentBalance,
              error: 'Saldo insuficiente'
            });

            console.warn(`⚠️ Saldo insuficiente para cuota de ${card.name}`);
          }
        }
      } catch (error) {
        console.error(`Error procesando cuota:`, error);
        errors.push({
          card: card.name,
          error: error.message
        });
      }
    }

    // Guardar transacciones actualizadas
    await this.storage.saveTransactions(transactions);

    return { charged, errors };
  }

  async processOldPendingInstallments() {
    try {
      console.log('🔄 Procesando cuotas viejas pendientes...');

      const transactions = await this.storage.getTransactions();
      const cards = await this.storage.getCards();
      const today = new Date();
      const currentMonth = today.getMonth();
      const currentYear = today.getFullYear();

      let processed = 0;

      // Buscar cuotas pendientes de meses anteriores
      const oldPendingInstallments = transactions.filter(tx => {
        if (!tx.isInstallment || tx.autoCharged || tx.paymentMethod !== 'Crédito') {
          return false;
        }

        const txDate = new Date(tx.date);
        const txMonth = txDate.getMonth();
        const txYear = txDate.getFullYear();

        // Verificar si es de un mes anterior
        return (txYear < currentYear) || (txYear === currentYear && txMonth < currentMonth);
      });

      console.log(`📋 Cuotas viejas pendientes encontradas: ${oldPendingInstallments.length}`);

      for (const installment of oldPendingInstallments) {
        const card = cards.find(c => c.name === installment.card);

        if (card && card.walletId) {
          try {
            const wallet = await this.walletManager.getById(card.walletId);

            if (wallet.currentBalance >= installment.amount) {
              // Descontar de wallet
              await this.walletManager.updateBalance(
                card.walletId,
                installment.amount,
                'subtract'
              );

              // Marcar como cobrada
              const index = transactions.findIndex(t => t.id === installment.id);
              if (index !== -1) {
                transactions[index].autoCharged = true;
                transactions[index].autoChargedDate = new Date().toISOString();
                transactions[index].latePayment = true; // Marcar como pago atrasado
                transactions[index].updatedAt = new Date().toISOString();
              }

              processed++;

              console.log(`✅ Cuota atrasada pagada: ${installment.description}`);
            } else {
              console.warn(`⚠️ Saldo insuficiente para cuota atrasada: ${installment.description}`);
            }
          } catch (error) {
            console.error(`Error procesando cuota atrasada:`, error);
          }
        }
      }

      // Guardar transacciones actualizadas
      if (processed > 0) {
        await this.storage.saveTransactions(transactions);
        console.log(`✅ ${processed} cuotas atrasadas procesadas`);
      }

      return processed;

    } catch (error) {
      console.error('Error en processOldPendingInstallments:', error);
      return 0;
    }
  }

  // ✅ Obtener reporte de cuotas pendientes
  async getPendingInstallmentsReport() {
    const transactions = await this.storage.getTransactions();
    const cards = await this.storage.getCards();
    const today = new Date();

    const creditCards = cards.filter(card =>
      card.type === 'Crédito' &&
      card.walletId &&
      card.dueDay
    );

    const report = [];

    for (const card of creditCards) {
      const pendingInstallments = transactions.filter(tx =>
        tx.card === card.name &&
        tx.isInstallment &&
        !tx.autoCharged &&
        new Date(tx.date) <= today
      );

      if (pendingInstallments.length > 0) {
        const totalAmount = pendingInstallments.reduce((sum, tx) => sum + tx.amount, 0);

        const wallet = await this.walletManager.getById(card.walletId);

        report.push({
          card: card.name,
          cardId: card.id,
          dueDay: card.dueDay,
          walletName: wallet.name,
          walletBalance: wallet.currentBalance,
          pendingCount: pendingInstallments.length,
          totalAmount,
          hasSufficientBalance: wallet.currentBalance >= totalAmount,
          installments: pendingInstallments.map(tx => ({
            description: tx.description,
            amount: tx.amount,
            date: tx.date,
            current: tx.installmentInfo.current,
            total: tx.installmentInfo.total
          }))
        });
      }
    }

    return report;
  }

  // ✅ Simular próximos cargos (útil para mostrar al usuario)
  async getUpcomingCharges(months = 3) {
    const transactions = await this.storage.getTransactions();
    const cards = await this.storage.getCards();
    const today = new Date();

    const upcoming = [];

    for (let i = 0; i < months; i++) {
      const targetDate = new Date(today);
      targetDate.setMonth(today.getMonth() + i);
      const targetMonth = targetDate.getMonth();
      const targetYear = targetDate.getFullYear();

      for (const card of cards.filter(c => c.type === 'Crédito' && c.dueDay)) {
        const monthInstallments = transactions.filter(tx =>
          tx.card === card.name &&
          tx.isInstallment &&
          !tx.autoCharged
        ).filter(tx => {
          const txDate = new Date(tx.date);
          return txDate.getMonth() === targetMonth && txDate.getFullYear() === targetYear;
        });

        if (monthInstallments.length > 0) {
          const totalAmount = monthInstallments.reduce((sum, tx) => sum + tx.amount, 0);

          upcoming.push({
            month: `${targetDate.toLocaleString('es-AR', { month: 'long' })} ${targetYear}`,
            dueDay: card.dueDay,
            card: card.name,
            installmentsCount: monthInstallments.length,
            totalAmount,
            installments: monthInstallments
          });
        }
      }
    }

    return upcoming.sort((a, b) => new Date(a.month) - new Date(b.month));
  }

  // ✅ Configurar recordatorios (para mostrar en dashboard)
  async getPaymentReminders() {
    const today = new Date();
    const currentDay = today.getDate();

    const report = await this.getPendingInstallmentsReport();

    const reminders = report.filter(r => {
      const daysUntilDue = r.dueDay - currentDay;

      // Mostrar si faltan 3 días o menos
      return daysUntilDue >= 0 && daysUntilDue <= 3;
    }).map(r => {
      // Calcular el faltante redondeado a 2 decimales
      const faltante = (r.totalAmount - r.walletBalance).toFixed(2);

      return {
        type: 'payment_reminder',
        priority: r.hasSufficientBalance ? 'medium' : 'high',
        card: r.card,
        dueDay: r.dueDay,
        daysUntil: r.dueDay - currentDay,
        amount: r.totalAmount,
        hasSufficientBalance: r.hasSufficientBalance,
        message: r.hasSufficientBalance ?
          `Pago automático de ${r.card} en ${r.dueDay - currentDay} días` :
          `Saldo insuficiente para pago de ${r.card} (falta $ ${faltante})`
      };
    });

    return reminders;
  }
}

