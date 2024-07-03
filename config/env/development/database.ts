export default ({ env }) => ({
	connection: {
		client: 'postgres',
		connection: {
		host: env('DATABASE_HOST', 'localhost'),
			port: env.int('DATABASE_PORT', 5432),
			database: env('DATABASE_NAME', 'markketdb'),
			user: env('DATABASE_USERNAME', 'headlessuser'),
			password: env('DATABASE_PASSWORD', '0J|x4~82Sqzgmar'),
			ssl: env.bool('DATABASE_SSL', false)
		}
	}
});
