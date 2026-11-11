-- CreateTable
CREATE TABLE `corridas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `passageiro_id` VARCHAR(64) NOT NULL,
    `motorista_id` VARCHAR(64) NULL,
    `origem` VARCHAR(255) NOT NULL,
    `destino` VARCHAR(255) NOT NULL,
    `status` ENUM('SOLICITADA', 'ACEITA', 'EM_ANDAMENTO', 'FINALIZADA') NOT NULL DEFAULT 'SOLICITADA',
    `idempotency_key` VARCHAR(255) NULL,
    `criado_em` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `atualizado_em` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `corridas_passageiro_id_idempotency_key_key`(`passageiro_id`, `idempotency_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
