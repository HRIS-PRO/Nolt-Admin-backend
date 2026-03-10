import swaggerJsdoc from 'swagger-jsdoc';

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Nolt Admin Backend API',
            version: '1.0.0',
            description: 'API documentation for Nolt Admin authentication and customer management',
        },
        servers: [
            {
                url: 'https://nolt-admin-backend-production.up.railway.app',
                description: 'Production server',
            },

            {
                url: 'http://noltadmin1.eu-central-1.elasticbeanstalk.com',
                description: 'Staging server',
            },
        ],
        components: {
            securitySchemes: {
                cookieAuth: {
                    type: 'apiKey',
                    in: 'cookie',
                    name: 'connect.sid', // default name for express-session
                },
            },
        },
    },
    apis: ['./routes/*.ts'], // files containing annotations as above
};

const swaggerSpec = swaggerJsdoc(options);

export default swaggerSpec;
