-- Внешние ключи таблиц ядра на таблицы модуля courses (D-051, D-052, D-054): в Drizzle-схеме ядра их объявить нельзя —
-- @dinastia/db не импортирует таблицы модулей. Составные (school_id, …) — сослаться на чужую школу невозможно (D-038).
-- Удаление урока удаляет его блоки (черновик и публикацию, каскадом — данные типов); удаление курса — его вопросы.
ALTER TABLE "lesson_blocks" ADD CONSTRAINT "lesson_blocks_school_id_lesson_id_lessons_fk" FOREIGN KEY ("school_id","lesson_id") REFERENCES "public"."lessons"("school_id","id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_school_id_course_id_courses_fk" FOREIGN KEY ("school_id","course_id") REFERENCES "public"."courses"("school_id","id") ON DELETE cascade;
