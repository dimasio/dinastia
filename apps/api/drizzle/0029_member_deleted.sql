ALTER TYPE "public"."member_status" ADD VALUE 'deleted';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
-- Журнал неизменяем для app_user (0003); при обезличивании ученика (5.5) обнуляется только IP его записей и только в
-- школе текущей транзакции. Функция владельца таблицы — единственный путь изменить журнал.
CREATE FUNCTION "audit_forget_ip"("p_member" uuid) RETURNS integer
	LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
	WITH updated AS (
		UPDATE "audit_log" SET "ip" = NULL
		WHERE "actor_member_id" = "p_member"
			AND "ip" IS NOT NULL
			AND "school_id" = nullif(current_setting('app.school_id', true), '')::uuid
		RETURNING 1
	)
	SELECT count(*)::integer FROM updated
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION "audit_forget_ip"(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "audit_forget_ip"(uuid) TO "app_user";
