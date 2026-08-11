import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('revoked_tokens')
export class RevokedToken {
  // jti (JWT ID) del access token revocado en el logout
  @PrimaryColumn({ type: 'varchar', length: 64 })
  jti: string;

  // Momento en que vence el access token: la fila deja de ser necesaria después
  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
